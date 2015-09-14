/// <reference path="lib/typings/es6-promise.d.ts" />
/// <reference path="lib/typings/node.d.ts" />
/// <reference path="lib/typings/fs-extra.d.ts" />
/// <reference path="lib/typings/mysql.d.ts" />
/// <reference path="lib/typings/moment-node.d.ts" />

                    require("es6-promise").polyfill();
import Util       = require("util");
var    Extend     = require("extend");
import Http       = require("http");
import Path       = require("path");
import FileSystem = require("fs-extra");
var    Unzip      = require("unzip");
var    StatusBar  = require("status-bar");
import MySql      = require("mysql");
import moment     = require("moment");
                    require("moment-duration-format");
import Config     = require("./config");
import Defs       = require("./lib/defs");

var _startMoment = moment();
var _baseUrl = Config.baseUrl.replace(/\/+$/, "");
var _promise = new Promise<any>((resolve) => resolve());
var _localFileRe = /^local:/;
var _downloadsCount = 0;

console.log("\nDownloading and unzipping files...");

for (let i = 0; i < Config.dataFilePaths.length; i++) {
	let dataFilePath = Config.dataFilePaths[i];
	let isLocal = dataFilePath.match(_localFileRe);
	dataFilePath = dataFilePath.replace(_localFileRe, "");
	let fileSubpath = Path.normalize(dataFilePath);
	let filePath = Path.join(Config.localDownloadDir, fileSubpath);
	let localFilePath = isLocal ? Path.join(Config.localDataFilesDir, fileSubpath) : null;

	if (Config.forceDownloading || !FileSystem.existsSync(filePath.replace(/\.\w+$/, ".txt"))) {
		if (++_downloadsCount === 1)
			console.log();

		if (isLocal) // file is stored locally: just copy it to downloads dir
			((dataFilePath: string, localFilePath: string, filePath: string) => {
				_promise = _promise.then(() => new Promise<any>((resolve, reject) => {
					process.stdout.write(`${dataFilePath}: copying locally...`);

					FileSystem.copy(localFilePath, filePath, error => {
						if (error) {
							console.error(`\n${error}\n`);
							reject();
						}
						else {
							console.log(" Done.");
							resolve();
						}
					});
				}));
			})(dataFilePath, localFilePath, filePath);
		else // download from server
			((dataFilePath: string) => // storing 'i' in current scope
				_promise = _promise.then(() => downloadFile(dataFilePath))
			)(dataFilePath);
	}
}

_promise.then(() => {
	if (!_downloadsCount)
		console.log("All files are already there, skipping (modify 'forceDownloading' in config).");

	let localDbAssetsDir = Path.join(Config.localDbAssetsDir, Config.db);
	let databaseName = Config[Config.db].databaseName;
	let createDbQuery = readQueryFromFile(Path.join(localDbAssetsDir, "create-db.sql"), databaseName, databaseName);
	let truncDbQuery = readQueryFromFile(Path.join(localDbAssetsDir, "trunc-db.sql"), databaseName);
	let dropDbQuery = readQueryFromFile(Path.join(localDbAssetsDir, "drop-db.sql"), databaseName);
	let postImportQuery = readQueryFromFile(Path.join(localDbAssetsDir, "post-import.sql"));

	if (Config.db === "mysql") {
		let databaseExists: boolean;

		_promise = _promise.then(() =>
			runMySqlQuery(`show databases like '${databaseName}'`)
				.then(o => databaseExists = !!o.rows.length)
		);

		_promise.then(() => {
			_promise.then(() => console.log());

			if (databaseExists)
				switch (Config.actionIfDbExists) {
					case Defs.ClearDbAction.Truncate: _promise = _promise.then(() => runMySqlQuery(truncDbQuery, `Database '${databaseName}' exists, truncating it...`)); break;
					case Defs.ClearDbAction.Drop:     _promise = _promise.then(() => runMySqlQuery(dropDbQuery,  `Database '${databaseName}' exists, dropping it...`));   break;
				}

			if (!databaseExists || Config.actionIfDbExists === Defs.ClearDbAction.Drop)
				_promise = _promise.then(() => runMySqlQuery(createDbQuery, `Creating database '${databaseName}'...`));

			if (databaseExists && Config.actionIfDbExists === Defs.ClearDbAction.None)
				_promise.then(() => console.log("Database exists, skipping import (modify 'actionIfDbExists' in config).\n"));
			else {
				_promise.then(() => console.log());

				let filePaths = getFilePathsRecursively(Path.normalize(Config.localDownloadDir))
					.filter(s => /\.txt$/i.test(s));

				for (let i = 0; i < filePaths.length; i++) {
					let filePath = filePaths[i].replace(/^[\/\\]+/, "").replace(/[\/\\]+$/, "");
					let fileSubpath = filePath.substr(Config.localDownloadDir.replace(/^[\/\\]+/, "").replace(/[\/\\]+$/, "").length).replace(/^[\/\\]+/, "");
					let importQueryPath = Path.join(localDbAssetsDir, "import", fileSubpath.replace(/\.\w+$/, ".sql"));
					let query = Util.format(FileSystem.readFileSync(importQueryPath, "UTF8"), databaseName, filePath);

					((query, filePath) =>
						_promise = _promise.then(() => runMySqlQuery(query, `Importing file '${filePath}'...`))
					)(query, filePath);

					if (i === filePaths.length - 1)
						_promise.then(() => console.log());
				}

				if (postImportQuery) {
					_promise = _promise.then(() => runMySqlQuery(`use ${databaseName};\n${postImportQuery}`, "Running post import query..."));
					_promise.then(() => console.log());
				}
			}

			_promise.then(() => console.log(`All operations completed in ${durationSince(_startMoment) }.\n`));
		});
	}
});

function downloadFile(fileUrlSubpath: string) {
	return new Promise<any>((resolve, reject) => {
		fileUrlSubpath = fileUrlSubpath.replace(/^\/+/, "");

		let fileUrl = `${_baseUrl}/${fileUrlSubpath}`;
		let fileSubpath = Path.normalize(fileUrlSubpath);
		let fileDir = Path.join(Config.localDownloadDir, Path.dirname(fileSubpath));
		let fileName = Path.basename(fileSubpath);
		let filePath = Path.join(fileDir, fileName);
		let statusBar;

		let handleError = (error: string) => {
			if (statusBar)
				statusBar.cancel();

			console.error(`\n${error}`);
			reject();
		};

		Http.get(fileUrl, (response: Http.ClientResponse) => {
			if (response.statusCode === 200) {
				if (fileDir)
					FileSystem.ensureDirSync(fileDir);

				statusBar = StatusBar.create({ total: response.headers["content-length"] })
					.on("render", stats => {
						process.stdout.write(
							((fileName: string) => {
								const filenameMaxLength = (<any>process.stdout).columns - 1 - 59;
								if (fileName.length > filenameMaxLength)
									fileName = fileName.slice(0, filenameMaxLength - 3) + "...";
								else {
									let remaining = filenameMaxLength - fileName.length;
									while (remaining--) fileName += " ";
								}
								return fileName;
							})(fileUrlSubpath)
							+ " " + statusBar.format.storage(stats.currentSize)
							+ " " + statusBar.format.speed(stats.speed)
							+ " " + statusBar.format.time(stats.remainingTime)
							+ " [" + statusBar.format.progressBar(stats.percentage) + "] "
							+ statusBar.format.percentage(stats.percentage)
						);

						(<any>process.stdout).cursorTo(0);
					})
					.on("finish", () => {
						console.log("");

						resolve();
					});

				response.pipe(statusBar);

				response.pipe(Path.extname(fileName).toLowerCase() !== ".zip"
					? FileSystem.createWriteStream(filePath)
					: Unzip.Extract({ path: fileDir }));
			}
			else
				handleError(`${fileUrlSubpath}: server returned ${response.statusCode}, aborting.`);
		})
		.on("error", handleError);
	});
};

function readQueryFromFile(fileName: string, ...args: any[]) {
	let fileExists = FileSystem.existsSync(fileName);
	let query = fileExists ? FileSystem.readFileSync(fileName, "UTF8").trim() : "";

	if (query && args.length)
		query = Util.format.apply(Util, [query].concat(args));

	return query;
}

function runMySqlQuery(query: string, message?: string) {
	return new Promise<any>((resolve, reject) => {
		if (message)
			process.stdout.write(message);

		let opMoment = moment();
		let connection = MySql.createConnection(Extend(true, { multipleStatements: true }, Config.mysql.connection));

		connection.connect();

		connection.query(query, (error, rows, fields) => {
			if (!error) {
				if (message)
					console.log(` Done in ${durationSince(opMoment) }.`);

				resolve({ rows: rows, fields: fields });
			}
			else {
				if (message)
					console.log(" Failed.");

				console.error(`\n${error}\n`);
				reject();
			}
		});

		connection.end();
	});
}

function getFilePathsRecursively(dir: string) {
	let filePaths = <string[]>[];

	let walk = (dir: string) => {
		let files = FileSystem.readdirSync(dir);

		files.forEach(name => {
			let path = Path.join(dir, name);

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

function durationSince(m: moment.Moment) {
	return (<any>moment.duration(moment().diff(m))).format("y[y] M[mo] d[d] h[h] m[m] s[s]");
}
