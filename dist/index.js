"use strict";
/* eslint-disable no-console */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const util = __importStar(require("util"));
const http = __importStar(require("http"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs-extra"));
const unzipper = __importStar(require("unzipper"));
const statusBarModule = __importStar(require("status-bar"));
const mysql = __importStar(require("mysql2/promise"));
const moment_1 = __importDefault(require("moment"));
require("moment-duration-format");
const config_1 = __importStar(require("./config"));
async function main() {
    const startMoment = (0, moment_1.default)();
    let downloadsCount = 0;
    console.log('\nDownloading and unzipping files...');
    // Process files sequentially.
    for (const dataFilePath of config_1.default.dataFilePaths) {
        downloadsCount = await processFile(dataFilePath, downloadsCount);
    }
    if (!downloadsCount) {
        console.log("All files are already there, skipping (modify 'forceDownloading' in config).");
    }
    if (config_1.default.dbType === 'mysql') {
        const importsPerformed = await processMySqlImport();
        if (importsPerformed) {
            console.log(`All operations completed in ${durationSince(startMoment)}.\n`);
        }
    }
}
// Process a single file (download or copy).
async function processFile(dataFilePath, downloadsCount) {
    const baseUrl = config_1.default.baseUrl.replace(/\/+$/, '');
    const localFileRe = /^local:/;
    const isLocal = Boolean(dataFilePath.match(localFileRe));
    const normalizedPath = dataFilePath.replace(localFileRe, '');
    const fileSubpath = path.normalize(normalizedPath);
    const filePath = path.join(config_1.default.localDownloadDir, fileSubpath);
    const localFilePath = isLocal
        ? path.join(config_1.default.localDataFilesDir, fileSubpath)
        : null;
    if (config_1.default.forceDownloading ||
        !fs.existsSync(filePath.replace(/\.\w+$/, '.txt'))) {
        if (++downloadsCount === 1) {
            console.log();
        }
        if (isLocal && localFilePath) {
            // File is stored locally: just copy it to downloads dir.
            await copyFileLocally(normalizedPath, localFilePath, filePath);
        }
        else {
            // Download from server.
            await downloadFile(normalizedPath, baseUrl);
        }
    }
    return downloadsCount;
}
// Process MySQL import tasks.
async function processMySqlImport() {
    const localDbAssetsDir = path.join(config_1.default.localDbAssetsDir, config_1.default.dbType);
    const databaseName = config_1.default.mysql.databaseName;
    // Load SQL query templates.
    const createDbQuery = readQueryFromFile(path.join(localDbAssetsDir, 'create-db.sql'), databaseName, databaseName);
    const truncDbQuery = readQueryFromFile(path.join(localDbAssetsDir, 'trunc-db.sql'), databaseName);
    const dropDbQuery = readQueryFromFile(path.join(localDbAssetsDir, 'drop-db.sql'), databaseName);
    const postImportQuery = readQueryFromFile(path.join(localDbAssetsDir, 'post-import.sql'));
    try {
        // Check if database exists.
        const result = await runMySqlQuery(`show databases like '${databaseName}'`);
        const databaseExists = !!result.rows.length;
        console.log();
        // Handle existing database according to config.
        if (databaseExists) {
            switch (config_1.default.actionIfDbExists) {
                case config_1.ClearDbAction.Truncate:
                    await runMySqlQuery(truncDbQuery, `Database '${databaseName}' exists, truncating it...`);
                    break;
                case config_1.ClearDbAction.Drop:
                    await runMySqlQuery(dropDbQuery, `Database '${databaseName}' exists, dropping it...`);
                    break;
            }
        }
        if (!databaseExists || config_1.default.actionIfDbExists === config_1.ClearDbAction.Drop) {
            await runMySqlQuery(createDbQuery, `Creating database '${databaseName}'...`);
        }
        if (databaseExists && config_1.default.actionIfDbExists === config_1.ClearDbAction.None) {
            console.log("Database exists, skipping import (modify 'actionIfDbExists' in config).\n");
            return false;
        }
        console.log();
        // Import data files.
        await importDataFiles(localDbAssetsDir, databaseName);
        // Run post-import query if exists.
        if (postImportQuery) {
            await runMySqlQuery(`use ${databaseName};\n${postImportQuery}`, 'Running post import query...');
            console.log();
        }
        return true;
    }
    catch (error) {
        console.error('An error occurred:', error);
        return false;
    }
}
// Import all data files.
async function importDataFiles(localDbAssetsDir, databaseName) {
    const filePaths = getFilePathsRecursively(path.normalize(config_1.default.localDownloadDir)).filter((s) => /\.txt$/i.test(s));
    for (let i = 0; i < filePaths.length; i++) {
        const filePath = filePaths[i].replace(/^[/\\]+/, '').replace(/[/\\]+$/, '');
        const fileSubpath = filePath
            .substr(config_1.default.localDownloadDir.replace(/^[/\\]+/, '').replace(/[/\\]+$/, '')
            .length)
            .replace(/^[/\\]+/, '');
        const importQueryPath = path.join(localDbAssetsDir, 'import', fileSubpath.replace(/\.\w+$/, '.sql'));
        const absoluteFilePath = filePaths[i].replace(/\\/g, '/');
        const query = util.format(fs.readFileSync(importQueryPath, { encoding: 'utf8' }), databaseName, absoluteFilePath);
        await runMySqlQuery(query, `Importing file '${filePath}'...`);
        if (i === filePaths.length - 1) {
            console.log();
        }
    }
}
// Helper function to copy a file locally.
async function copyFileLocally(dataFilePath, localFilePath, filePath) {
    process.stdout.write(`${dataFilePath}: copying locally...`);
    try {
        await fs.copy(localFilePath, filePath);
        console.log(' Done.');
    }
    catch (error) {
        console.error(`\n${error}\n`);
        throw error;
    }
}
async function downloadFile(fileUrlSubpath, baseUrl) {
    fileUrlSubpath = fileUrlSubpath.replace(/^\/+/, '');
    const fileUrl = `${baseUrl}/${fileUrlSubpath}`;
    const fileSubpath = path.normalize(fileUrlSubpath);
    const fileDir = path.join(config_1.default.localDownloadDir, path.dirname(fileSubpath));
    const fileName = path.basename(fileSubpath);
    const filePath = path.join(fileDir, fileName);
    return new Promise((resolve, reject) => {
        let completed = false;
        let statusBar;
        const completeOnce = (fn) => {
            if (!completed) {
                completed = true;
                fn();
            }
        };
        const resolveOnce = () => completeOnce(resolve);
        const rejectOnce = (error) => completeOnce(() => {
            statusBar?.cancel();
            console.error(`\n${error}`);
            reject(error);
        });
        try {
            // Ensure directory exists.
            if (fileDir) {
                fs.ensureDirSync(fileDir);
            }
            const request = http.get(fileUrl, (response) => {
                if (response.statusCode !== 200) {
                    rejectOnce(new Error(`${fileUrlSubpath}: server returned ${response.statusCode}, aborting.`));
                    return;
                }
                statusBar = statusBarModule
                    .create({ total: Number(response.headers['content-length']) })
                    .on('render', (stats) => {
                    let displayName = fileUrlSubpath;
                    const maxLength = (process.stdout.columns || 80) - 1 - 59;
                    // Format display name.
                    if (displayName.length > maxLength) {
                        displayName = displayName.slice(0, maxLength - 3) + '...';
                    }
                    else {
                        displayName = displayName.padEnd(maxLength);
                    }
                    const size = statusBar.format.storage(stats.currentSize);
                    const speed = statusBar.format.speed(stats.speed);
                    const time = statusBar.format.time(stats.remainingTime);
                    const progress = statusBar.format.progressBar(stats.percentage);
                    const percent = statusBar.format.percentage(stats.percentage);
                    process.stdout.write(`${displayName} ${size} ${speed} ${time} [${progress}] ${percent}`);
                    process.stdout.cursorTo(0);
                })
                    .on('finish', () => {
                    console.log();
                    resolveOnce();
                });
                response.pipe(statusBar);
                // Determine if we should extract or save directly.
                const isZip = path.extname(fileName).toLowerCase() === '.zip';
                response.pipe(isZip
                    ? unzipper.Extract({ path: fileDir }).on('error', rejectOnce)
                    : fs.createWriteStream(filePath).on('error', rejectOnce));
            });
            request.on('error', rejectOnce);
        }
        catch (error) {
            rejectOnce(error);
        }
    });
}
function readQueryFromFile(fileName, ...args) {
    if (!fs.existsSync(fileName)) {
        throw new Error(`SQL file not found: ${fileName}`);
    }
    let query = fs.readFileSync(fileName, { encoding: 'utf8' }).trim();
    if (query && args.length) {
        query = util.format.apply(util, [query].concat(args));
    }
    return query;
}
async function runMySqlQuery(query, message) {
    if (message) {
        process.stdout.write(message);
    }
    const opMoment = (0, moment_1.default)();
    const connectionOptions = {
        ...config_1.default.mysql.connection,
        multipleStatements: true,
        infileStreamFactory: (path) => fs.createReadStream(path),
    };
    const connection = await mysql.createConnection(connectionOptions);
    try {
        const [rows, fields] = await connection.query(query);
        if (message) {
            console.log(` Done in ${durationSince(opMoment)}.`);
        }
        return { rows: rows, fields: fields };
    }
    catch (error) {
        if (message) {
            console.log(' Failed.');
        }
        console.error(`\n${error}\n`);
        throw error;
    }
    finally {
        await connection.end();
    }
}
function getFilePathsRecursively(dir) {
    let filePaths = [];
    const walk = (dirPath) => {
        const files = fs.readdirSync(dirPath);
        files.forEach((name) => {
            const filePath = path.join(dirPath, name);
            if (fs.statSync(filePath).isDirectory()) {
                walk(filePath);
            }
            else {
                filePaths.push(filePath);
            }
        });
    };
    walk(dir);
    return filePaths;
}
function durationSince(m) {
    return moment_1.default
        .duration((0, moment_1.default)().diff(m))
        .format('y[y] M[mo] d[d] h[h] m[m] s[s]');
}
// Start the application.
main().catch((error) => console.error('Application error:', error));
//# sourceMappingURL=index.js.map