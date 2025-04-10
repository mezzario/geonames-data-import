/* eslint-disable no-console */

const util = require('util');
const http = require('http');
const path = require('path');
const fs = require('fs-extra');
const unzipper = require('unzipper');
const statusBarModule = require('status-bar');
const mysql = require('mysql2/promise');
const moment = require('moment');
require('moment-duration-format');
const configModule = require('./config');
const config = configModule.default;
const {ClearDbAction} = configModule;

const _startMoment = moment();
const _baseUrl = config.baseUrl.replace(/\/+$/, '');
const _localFileRe = /^local:/;

let _promise = new Promise((resolve) => resolve());
let _downloadsCount = 0;

console.log('\nDownloading and unzipping files...');

for (let i = 0; i < config.dataFilePaths.length; i++) {
  let dataFilePath = config.dataFilePaths[i];
  const isLocal = dataFilePath.match(_localFileRe);
  dataFilePath = dataFilePath.replace(_localFileRe, '');
  const fileSubpath = path.normalize(dataFilePath);
  const filePath = path.join(config.localDownloadDir, fileSubpath);
  const localFilePath = isLocal
    ? path.join(config.localDataFilesDir, fileSubpath)
    : null;

  if (
    config.forceDownloading ||
    !fs.existsSync(filePath.replace(/\.\w+$/, '.txt'))
  ) {
    if (++_downloadsCount === 1) {
      console.log();
    }

    if (isLocal) {
      // file is stored locally: just copy it to downloads dir
      ((dataFilePath, localFilePath, filePath) => {
        _promise = _promise.then(
          () =>
            new Promise((resolve, reject) => {
              process.stdout.write(`${dataFilePath}: copying locally...`);

              fs.copy(localFilePath, filePath, (error) => {
                if (error) {
                  console.error(`\n${error}\n`);
                  reject();
                } else {
                  console.log(' Done.');
                  resolve();
                }
              });
            })
        );
      })(dataFilePath, localFilePath, filePath);
    } else {
      // download from server
      ((
        dataFilePath // storing 'i' in current scope
      ) => (_promise = _promise.then(() => downloadFile(dataFilePath))))(
        dataFilePath
      );
    }
  }
}

_promise.then(() => {
  if (!_downloadsCount) {
    console.log(
      "All files are already there, skipping (modify 'forceDownloading' in config)."
    );
  }

  const localDbAssetsDir = path.join(config.localDbAssetsDir, config.dbType);
  const databaseName = config[config.dbType].databaseName;
  const createDbQuery = readQueryFromFile(
    path.join(localDbAssetsDir, 'create-db.sql'),
    databaseName,
    databaseName
  );
  const truncDbQuery = readQueryFromFile(
    path.join(localDbAssetsDir, 'trunc-db.sql'),
    databaseName
  );
  const dropDbQuery = readQueryFromFile(
    path.join(localDbAssetsDir, 'drop-db.sql'),
    databaseName
  );
  const postImportQuery = readQueryFromFile(
    path.join(localDbAssetsDir, 'post-import.sql')
  );

  if (config.dbType === 'mysql') {
    let databaseExists;
    _promise = _promise.then(() =>
      runMySqlQuery(`show databases like '${databaseName}'`).then(
        (o) => (databaseExists = !!o.rows.length)
      )
    );

    _promise.then(() => {
      _promise.then(() => console.log());
      if (databaseExists) {
        switch (config.actionIfDbExists) {
          case ClearDbAction.Truncate:
            _promise = _promise.then(() =>
              runMySqlQuery(
                truncDbQuery,
                `Database '${databaseName}' exists, truncating it...`
              )
            );
            break;
          case ClearDbAction.Drop:
            _promise = _promise.then(() =>
              runMySqlQuery(
                dropDbQuery,
                `Database '${databaseName}' exists, dropping it...`
              )
            );
            break;
        }
      }

      if (!databaseExists || config.actionIfDbExists === ClearDbAction.Drop) {
        _promise = _promise.then(() =>
          runMySqlQuery(createDbQuery, `Creating database '${databaseName}'...`)
        );
      }

      if (databaseExists && config.actionIfDbExists === ClearDbAction.None) {
        _promise.then(() =>
          console.log(
            "Database exists, skipping import (modify 'actionIfDbExists' in config).\n"
          )
        );
      } else {
        _promise.then(() => console.log());

        const filePaths = getFilePathsRecursively(
          path.normalize(config.localDownloadDir)
        ).filter((s) => /\.txt$/i.test(s));

        for (let i = 0; i < filePaths.length; i++) {
          const filePath = filePaths[i]
            .replace(/^[/\\]+/, '')
            .replace(/[/\\]+$/, '');
          const fileSubpath = filePath
            .substr(
              config.localDownloadDir
                .replace(/^[/\\]+/, '')
                .replace(/[/\\]+$/, '').length
            )
            .replace(/^[/\\]+/, '');
          const importQueryPath = path.join(
            localDbAssetsDir,
            'import',
            fileSubpath.replace(/\.\w+$/, '.sql')
          );

          // Use the original absolute file path directly, not path.resolve which might be causing issues
          const absoluteFilePath = filePaths[i].replace(/\\/g, '/');

          const query = util.format(
            fs.readFileSync(importQueryPath, 'UTF8'),
            databaseName,
            absoluteFilePath
          );

          ((query, filePath) =>
            (_promise = _promise.then(() =>
              runMySqlQuery(query, `Importing file '${filePath}'...`)
            )))(query, filePath);

          if (i === filePaths.length - 1) {
            _promise.then(() => console.log());
          }
        }

        if (postImportQuery) {
          _promise = _promise.then(() =>
            runMySqlQuery(
              `use ${databaseName};\n${postImportQuery}`,
              'Running post import query...'
            )
          );
          _promise.then(() => console.log());
        }
      }

      _promise.then(() =>
        console.log(
          `All operations completed in ${durationSince(_startMoment)}.\n`
        )
      );
    });
  }
});

function downloadFile(fileUrlSubpath) {
  return new Promise((resolve, reject) => {
    fileUrlSubpath = fileUrlSubpath.replace(/^\/+/, '');

    const fileUrl = `${_baseUrl}/${fileUrlSubpath}`;
    const fileSubpath = path.normalize(fileUrlSubpath);
    const fileDir = path.join(
      config.localDownloadDir,
      path.dirname(fileSubpath)
    );
    const fileName = path.basename(fileSubpath);
    const filePath = path.join(fileDir, fileName);
    let statusBar;

    const handleError = (error) => {
      if (statusBar) {
        statusBar.cancel();
      }
      console.error(`\n${error}`);
      reject();
    };

    http
      .get(fileUrl, (response) => {
        if (response.statusCode === 200) {
          if (fileDir) {
            fs.ensureDirSync(fileDir);
          }
          statusBar = statusBarModule
            .create({
              total: response.headers['content-length'],
            })
            .on('render', (stats) => {
              let fileName = fileUrlSubpath;
              const filenameMaxLength = process.stdout.columns - 1 - 59;
              if (fileName.length > filenameMaxLength) {
                fileName = fileName.slice(0, filenameMaxLength - 3) + '...';
              } else {
                let remaining = filenameMaxLength - fileName.length;
                while (remaining--) {
                  fileName += ' ';
                }
              }
              const size = statusBar.format.storage(stats.currentSize);
              const speed = statusBar.format.speed(stats.speed);
              const time = statusBar.format.time(stats.remainingTime);
              const progress = statusBar.format.progressBar(stats.percentage);
              const percent = statusBar.format.percentage(stats.percentage);
              process.stdout.write(
                `${fileName} ${size} ${speed} ${time} [${progress}] ${percent}`
              );
              process.stdout.cursorTo(0);
            })
            .on('finish', () => {
              console.log('');
              resolve();
            });

          response.pipe(statusBar);
          response.pipe(
            path.extname(fileName).toLowerCase() !== '.zip'
              ? fs.createWriteStream(filePath)
              : unzipper.Extract({path: fileDir})
          );
        } else {
          handleError(
            `${fileUrlSubpath}: server returned ${response.statusCode}, aborting.`
          );
        }
      })
      .on('error', handleError);
  });
}

function readQueryFromFile(fileName, ...args) {
  const fileExists = fs.existsSync(fileName);
  let query = fileExists ? fs.readFileSync(fileName, 'UTF8').trim() : '';
  if (query && args.length) {
    query = util.format.apply(util, [query].concat(args));
  }
  return query;
}

async function runMySqlQuery(query, message) {
  if (message) {
    process.stdout.write(message);
  }
  const opMoment = moment();
  const connection = await mysql.createConnection({
    multipleStatements: true,
    ...config.mysql.connection,
    infileStreamFactory: (path) => fs.createReadStream(path),
  });

  try {
    const [rows, fields] = await connection.query(query);
    if (message) {
      console.log(` Done in ${durationSince(opMoment)}.`);
    }
    await connection.end();
    return {rows, fields};
  } catch (error) {
    if (message) {
      console.log(' Failed.');
    }
    console.error(`\n${error}\n`);
    await connection.end();
    throw error;
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
      } else {
        filePaths.push(filePath);
      }
    });
    return filePaths;
  };
  walk(dir);
  return filePaths;
}

function durationSince(m) {
  return moment
    .duration(moment().diff(m))
    .format('y[y] M[mo] d[d] h[h] m[m] s[s]');
}
