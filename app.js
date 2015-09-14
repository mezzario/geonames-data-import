/// <reference path="lib/typings/es6-promise.d.ts" />
/// <reference path="lib/typings/node.d.ts" />
/// <reference path="lib/typings/fs-extra.d.ts" />
/// <reference path="lib/typings/mysql.d.ts" />
/// <reference path="lib/typings/moment-node.d.ts" />
require("es6-promise").polyfill();
var Util = require("util");
var Extend = require("extend");
var Http = require("http");
var Path = require("path");
var FileSystem = require("fs-extra");
var Unzip = require("unzip");
var StatusBar = require("status-bar");
var MySql = require("mysql");
var moment = require("moment");
require("moment-duration-format");
var Config = require("./config");
var Defs = require("./lib/defs");
var _startMoment = moment();
var _baseUrl = Config.baseUrl.replace(/\/+$/, "");
var _promise = new Promise(function (resolve) { return resolve(); });
var _localFileRe = /^local:/;
var _downloadsCount = 0;
console.log("\nDownloading and unzipping files...");
for (var i = 0; i < Config.dataFilePaths.length; i++) {
    var dataFilePath = Config.dataFilePaths[i];
    var isLocal = dataFilePath.match(_localFileRe);
    dataFilePath = dataFilePath.replace(_localFileRe, "");
    var fileSubpath = Path.normalize(dataFilePath);
    var filePath = Path.join(Config.localDownloadDir, fileSubpath);
    var localFilePath = isLocal ? Path.join(Config.localDataFilesDir, fileSubpath) : null;
    if (Config.forceDownloading || !FileSystem.existsSync(filePath.replace(/\.\w+$/, ".txt"))) {
        if (++_downloadsCount === 1)
            console.log();
        if (isLocal)
            (function (dataFilePath, localFilePath, filePath) {
                _promise = _promise.then(function () { return new Promise(function (resolve, reject) {
                    process.stdout.write(dataFilePath + ": copying locally...");
                    FileSystem.copy(localFilePath, filePath, function (error) {
                        if (error) {
                            console.error("\n" + error + "\n");
                            reject();
                        }
                        else {
                            console.log(" Done.");
                            resolve();
                        }
                    });
                }); });
            })(dataFilePath, localFilePath, filePath);
        else
            (function (dataFilePath) {
                return _promise = _promise.then(function () { return downloadFile(dataFilePath); });
            })(dataFilePath);
    }
}
_promise.then(function () {
    if (!_downloadsCount)
        console.log("All files are already there, skipping (modify 'forceDownloading' in config).");
    var localDbAssetsDir = Path.join(Config.localDbAssetsDir, Config.db);
    var databaseName = Config[Config.db].databaseName;
    var createDbQuery = readQueryFromFile(Path.join(localDbAssetsDir, "create-db.sql"), databaseName, databaseName);
    var truncDbQuery = readQueryFromFile(Path.join(localDbAssetsDir, "trunc-db.sql"), databaseName);
    var dropDbQuery = readQueryFromFile(Path.join(localDbAssetsDir, "drop-db.sql"), databaseName);
    var postImportQuery = readQueryFromFile(Path.join(localDbAssetsDir, "post-import.sql"));
    if (Config.db === "mysql") {
        var databaseExists;
        _promise = _promise.then(function () {
            return runMySqlQuery("show databases like '" + databaseName + "'")
                .then(function (o) { return databaseExists = !!o.rows.length; });
        });
        _promise.then(function () {
            _promise.then(function () { return console.log(); });
            if (databaseExists)
                switch (Config.actionIfDbExists) {
                    case Defs.ClearDbAction.Truncate:
                        _promise = _promise.then(function () { return runMySqlQuery(truncDbQuery, "Database '" + databaseName + "' exists, truncating it..."); });
                        break;
                    case Defs.ClearDbAction.Drop:
                        _promise = _promise.then(function () { return runMySqlQuery(dropDbQuery, "Database '" + databaseName + "' exists, dropping it..."); });
                        break;
                }
            if (!databaseExists || Config.actionIfDbExists === Defs.ClearDbAction.Drop)
                _promise = _promise.then(function () { return runMySqlQuery(createDbQuery, "Creating database '" + databaseName + "'..."); });
            if (databaseExists && Config.actionIfDbExists === Defs.ClearDbAction.None)
                _promise.then(function () { return console.log("Database exists, skipping import (modify 'actionIfDbExists' in config).\n"); });
            else {
                _promise.then(function () { return console.log(); });
                var filePaths = getFilePathsRecursively(Path.normalize(Config.localDownloadDir))
                    .filter(function (s) { return /\.txt$/i.test(s); });
                for (var i = 0; i < filePaths.length; i++) {
                    var filePath = filePaths[i].replace(/^[\/\\]+/, "").replace(/[\/\\]+$/, "");
                    var fileSubpath = filePath.substr(Config.localDownloadDir.replace(/^[\/\\]+/, "").replace(/[\/\\]+$/, "").length).replace(/^[\/\\]+/, "");
                    var importQueryPath = Path.join(localDbAssetsDir, "import", fileSubpath.replace(/\.\w+$/, ".sql"));
                    var query = Util.format(FileSystem.readFileSync(importQueryPath, "UTF8"), databaseName, filePath);
                    (function (query, filePath) {
                        return _promise = _promise.then(function () { return runMySqlQuery(query, "Importing file '" + filePath + "'..."); });
                    })(query, filePath);
                    if (i === filePaths.length - 1)
                        _promise.then(function () { return console.log(); });
                }
                if (postImportQuery) {
                    _promise = _promise.then(function () { return runMySqlQuery("use " + databaseName + ";\n" + postImportQuery, "Running post import query..."); });
                    _promise.then(function () { return console.log(); });
                }
            }
            _promise.then(function () { return console.log("All operations completed in " + durationSince(_startMoment) + ".\n"); });
        });
    }
});
function downloadFile(fileUrlSubpath) {
    return new Promise(function (resolve, reject) {
        fileUrlSubpath = fileUrlSubpath.replace(/^\/+/, "");
        var fileUrl = _baseUrl + "/" + fileUrlSubpath;
        var fileSubpath = Path.normalize(fileUrlSubpath);
        var fileDir = Path.join(Config.localDownloadDir, Path.dirname(fileSubpath));
        var fileName = Path.basename(fileSubpath);
        var filePath = Path.join(fileDir, fileName);
        var statusBar;
        var handleError = function (error) {
            if (statusBar)
                statusBar.cancel();
            console.error("\n" + error);
            reject();
        };
        Http.get(fileUrl, function (response) {
            if (response.statusCode === 200) {
                if (fileDir)
                    FileSystem.ensureDirSync(fileDir);
                statusBar = StatusBar.create({ total: response.headers["content-length"] })
                    .on("render", function (stats) {
                    process.stdout.write((function (fileName) {
                        var filenameMaxLength = process.stdout.columns - 1 - 59;
                        if (fileName.length > filenameMaxLength)
                            fileName = fileName.slice(0, filenameMaxLength - 3) + "...";
                        else {
                            var remaining = filenameMaxLength - fileName.length;
                            while (remaining--)
                                fileName += " ";
                        }
                        return fileName;
                    })(fileUrlSubpath)
                        + " " + statusBar.format.storage(stats.currentSize)
                        + " " + statusBar.format.speed(stats.speed)
                        + " " + statusBar.format.time(stats.remainingTime)
                        + " [" + statusBar.format.progressBar(stats.percentage) + "] "
                        + statusBar.format.percentage(stats.percentage));
                    process.stdout.cursorTo(0);
                })
                    .on("finish", function () {
                    console.log("");
                    resolve();
                });
                response.pipe(statusBar);
                response.pipe(Path.extname(fileName).toLowerCase() !== ".zip"
                    ? FileSystem.createWriteStream(filePath)
                    : Unzip.Extract({ path: fileDir }));
            }
            else
                handleError(fileUrlSubpath + ": server returned " + response.statusCode + ", aborting.");
        })
            .on("error", handleError);
    });
}
;
function readQueryFromFile(fileName) {
    var args = [];
    for (var _i = 1; _i < arguments.length; _i++) {
        args[_i - 1] = arguments[_i];
    }
    var fileExists = FileSystem.existsSync(fileName);
    var query = fileExists ? FileSystem.readFileSync(fileName, "UTF8").trim() : "";
    if (query && args.length)
        query = Util.format.apply(Util, [query].concat(args));
    return query;
}
function runMySqlQuery(query, message) {
    return new Promise(function (resolve, reject) {
        if (message)
            process.stdout.write(message);
        var opMoment = moment();
        var connection = MySql.createConnection(Extend(true, { multipleStatements: true }, Config.mysql.connection));
        connection.connect();
        connection.query(query, function (error, rows, fields) {
            if (!error) {
                if (message)
                    console.log(" Done in " + durationSince(opMoment) + ".");
                resolve({ rows: rows, fields: fields });
            }
            else {
                if (message)
                    console.log(" Failed.");
                console.error("\n" + error + "\n");
                reject();
            }
        });
        connection.end();
    });
}
function getFilePathsRecursively(dir) {
    var filePaths = [];
    var walk = function (dir) {
        var files = FileSystem.readdirSync(dir);
        files.forEach(function (name) {
            var path = Path.join(dir, name);
            if (FileSystem.statSync(path).isDirectory())
                filePaths = walk(path);
            else
                filePaths.push(path);
        });
        return filePaths;
    };
    walk(dir);
    return filePaths;
}
function durationSince(m) {
    return moment.duration(moment().diff(m)).format("y[y] M[mo] d[d] h[h] m[m] s[s]");
}
//# sourceMappingURL=app.js.map