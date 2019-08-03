/* eslint-disable no-console */

const Util = require('util')
const Extend = require('extend')
const Http = require('http')
const Path = require('path')
const FileSystem = require('fs-extra')
const Unzipper = require('unzipper')
const StatusBar = require('status-bar')
const MySQL = require('mysql')
const moment = require('moment')
require('moment-duration-format')
const ConfigModule = require('./config')
const Config = ConfigModule.default
const {ClearDbAction} = ConfigModule

const _startMoment = moment()
const _baseUrl = Config.baseUrl.replace(/\/+$/, '')
const _localFileRe = /^local:/

let _promise = new Promise(resolve => resolve())
let _downloadsCount = 0

console.log('\nDownloading and unzipping files...')

for (let i = 0; i < Config.dataFilePaths.length; i++) {
  let dataFilePath = Config.dataFilePaths[i]
  const isLocal = dataFilePath.match(_localFileRe)
  dataFilePath = dataFilePath.replace(_localFileRe, '')
  const fileSubpath = Path.normalize(dataFilePath)
  const filePath = Path.join(Config.localDownloadDir, fileSubpath)
  const localFilePath = isLocal ? Path.join(Config.localDataFilesDir, fileSubpath) : null

  if (Config.forceDownloading || !FileSystem.existsSync(filePath.replace(/\.\w+$/, '.txt'))) {
    if (++_downloadsCount === 1) {
      console.log()
    }

    if (isLocal) { // file is stored locally: just copy it to downloads dir
      ((dataFilePath, localFilePath, filePath) => {
        _promise = _promise.then(() => new Promise((resolve, reject) => {
          process.stdout.write(`${dataFilePath}: copying locally...`)

          FileSystem.copy(localFilePath, filePath, error => {
            if (error) {
              console.error(`\n${error}\n`)
              reject()
            } else {
              console.log(' Done.')
              resolve()
            }
          })
        }))
      })(dataFilePath, localFilePath, filePath)
    } else { // download from server
      (dataFilePath => // storing 'i' in current scope
        _promise = _promise.then(() => downloadFile(dataFilePath))
      )(dataFilePath)
    }
  }
}

_promise.then(() => {
  if (!_downloadsCount) {
    console.log("All files are already there, skipping (modify 'forceDownloading' in config).")
  }

  const localDbAssetsDir = Path.join(Config.localDbAssetsDir, Config.dbType)
  const databaseName = Config[Config.dbType].databaseName
  const createDbQuery = readQueryFromFile(Path.join(localDbAssetsDir, 'create-db.sql'), databaseName, databaseName)
  const truncDbQuery = readQueryFromFile(Path.join(localDbAssetsDir, 'trunc-db.sql'), databaseName)
  const dropDbQuery = readQueryFromFile(Path.join(localDbAssetsDir, 'drop-db.sql'), databaseName)
  const postImportQuery = readQueryFromFile(Path.join(localDbAssetsDir, 'post-import.sql'))

  if (Config.dbType === 'mysql') {
    let databaseExists

    _promise = _promise.then(() =>
      runMySqlQuery(`show databases like '${databaseName}'`)
        .then(o => databaseExists = !!o.rows.length)
    )

    _promise.then(() => {
      _promise.then(() => console.log())

      if (databaseExists) {
        switch (Config.actionIfDbExists) {
          case ClearDbAction.Truncate: _promise = _promise.then(() => runMySqlQuery(truncDbQuery, `Database '${databaseName}' exists, truncating it...`)); break
          case ClearDbAction.Drop:     _promise = _promise.then(() => runMySqlQuery(dropDbQuery,  `Database '${databaseName}' exists, dropping it...`));   break
        }
      }

      if (!databaseExists || Config.actionIfDbExists === ClearDbAction.Drop) {
        _promise = _promise.then(() => runMySqlQuery(createDbQuery, `Creating database '${databaseName}'...`))
      }

      if (databaseExists && Config.actionIfDbExists === ClearDbAction.None) {
        _promise.then(() => console.log("Database exists, skipping import (modify 'actionIfDbExists' in config).\n"))
      } else {
        _promise.then(() => console.log())

        const filePaths = getFilePathsRecursively(Path.normalize(Config.localDownloadDir))
          .filter(s => /\.txt$/i.test(s))

        for (let i = 0; i < filePaths.length; i++) {
          const filePath = filePaths[i].replace(/^[/\\]+/, '').replace(/[/\\]+$/, '')
          const fileSubpath = filePath.substr(Config.localDownloadDir.replace(/^[/\\]+/, '').replace(/[/\\]+$/, '').length).replace(/^[/\\]+/, '')
          const importQueryPath = Path.join(localDbAssetsDir, 'import', fileSubpath.replace(/\.\w+$/, '.sql'))
          const query = Util.format(FileSystem.readFileSync(importQueryPath, 'UTF8'), databaseName, filePath);

          ((query, filePath) =>
            _promise = _promise.then(() => runMySqlQuery(query, `Importing file '${filePath}'...`))
          )(query, filePath)

          if (i === filePaths.length - 1) {
            _promise.then(() => console.log())
          }
        }

        if (postImportQuery) {
          _promise = _promise.then(() => runMySqlQuery(`use ${databaseName};\n${postImportQuery}`, 'Running post import query...'))
          _promise.then(() => console.log())
        }
      }

      _promise.then(() => console.log(`All operations completed in ${durationSince(_startMoment) }.\n`))
    })
  }
})

function downloadFile(fileUrlSubpath) {
  return new Promise((resolve, reject) => {
    fileUrlSubpath = fileUrlSubpath.replace(/^\/+/, '')

    const fileUrl = `${_baseUrl}/${fileUrlSubpath}`
    const fileSubpath = Path.normalize(fileUrlSubpath)
    const fileDir = Path.join(Config.localDownloadDir, Path.dirname(fileSubpath))
    const fileName = Path.basename(fileSubpath)
    const filePath = Path.join(fileDir, fileName)
    let statusBar

    const handleError = (error) => {
      if (statusBar) {
        statusBar.cancel()
      }

      console.error(`\n${error}`)
      reject()
    }

    Http.get(fileUrl, response => {
      if (response.statusCode === 200) {
        if (fileDir) {
          FileSystem.ensureDirSync(fileDir)
        }

        statusBar = StatusBar.create({total: response.headers['content-length']})
          .on('render', stats => {
            process.stdout.write(
              (fileName => {
                const filenameMaxLength = process.stdout.columns - 1 - 59
                if (fileName.length > filenameMaxLength) {
                  fileName = fileName.slice(0, filenameMaxLength - 3) + '...'
                } else {
                  let remaining = filenameMaxLength - fileName.length
                  while (remaining--) {
                    fileName += ' '
                  }
                }
                return fileName
              })(fileUrlSubpath)
                + ' ' + statusBar.format.storage(stats.currentSize)
                + ' ' + statusBar.format.speed(stats.speed)
                + ' ' + statusBar.format.time(stats.remainingTime)
                + ' [' + statusBar.format.progressBar(stats.percentage) + '] '
                + statusBar.format.percentage(stats.percentage)
            )

            process.stdout.cursorTo(0)
          })
          .on('finish', () => {
            console.log('')

            resolve()
          })

        response.pipe(statusBar)

        response.pipe(Path.extname(fileName).toLowerCase() !== '.zip'
          ? FileSystem.createWriteStream(filePath)
          : Unzipper.Extract({path: fileDir}))
      } else {
        handleError(`${fileUrlSubpath}: server returned ${response.statusCode}, aborting.`)
      }
    }).on('error', handleError)
  })
}

function readQueryFromFile(fileName, ...args) {
  const fileExists = FileSystem.existsSync(fileName)
  let query = fileExists ? FileSystem.readFileSync(fileName, 'UTF8').trim() : ''

  if (query && args.length) {
    query = Util.format.apply(Util, [query].concat(args))
  }

  return query
}

function runMySqlQuery(query, message) {
  return new Promise((resolve, reject) => {
    if (message) {
      process.stdout.write(message)
    }

    const opMoment = moment()
    const connection = MySQL.createConnection(Extend(true, {multipleStatements: true}, Config.mysql.connection))

    connection.connect()

    connection.query(query, (error, rows, fields) => {
      if (!error) {
        if (message) {
          console.log(` Done in ${durationSince(opMoment) }.`)
        }

        resolve({rows, fields})
      } else {
        if (message) {
          console.log(' Failed.')
        }

        console.error(`\n${error}\n`)
        reject()
      }
    })

    connection.end()
  })
}

function getFilePathsRecursively(dir) {
  let filePaths = []

  const walk = dir => {
    const files = FileSystem.readdirSync(dir)

    files.forEach(name => {
      const path = Path.join(dir, name)

      if (FileSystem.statSync(path).isDirectory()) {
        filePaths = walk(path)
      } else {
        filePaths.push(path)
      }
    })

    return filePaths
  }

  walk(dir)

  return filePaths
}

function durationSince(m) {
  return moment.duration(moment().diff(m)).format('y[y] M[mo] d[d] h[h] m[m] s[s]')
}
