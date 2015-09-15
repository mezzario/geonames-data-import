# geonames-data-import

Cross-platform console application written in [Node.js](https://nodejs.org/) to automate downloading/unzipping of [GeoNames](http://www.geonames.org/) worldwide geographical database [dumps](http://download.geonames.org/export/dump/) and importing them to database of choice ([MySQL](https://www.mysql.com/) is supported at the moment).

## Demo

_(some large files were omitted)_

![](https://cloud.githubusercontent.com/assets/2454284/9860210/5cecea10-5b33-11e5-953b-bc0929beb92f.gif)

## Usage

* Install [Node.js](https://nodejs.org/en/download/).

* Clone git repository:
```
git clone https://github.com/mezzario/geonames-data-import.git
```
* From app's folder install node modules:
```
npm install
```
* Edit `config.ts` (or `config.js`, if [TypeScript](http://www.typescriptlang.org/) is not installed) to adjust configuration, if needed (see below).

* Run application:
```
node app
```

To automatically run additional SQL queries after import, please refer to file:
```
assets/db/<db-engine-name>/post-import.sql
```

### Configuration

Edit `config.ts` (`config.js`) to adjust app's configuration:

```typescript
{
  // base URL do download files from
  baseUrl: "http://download.geonames.org/export",

  // list of file paths to download (relative to 'baseUrl')
  dataFilePaths: [...],

  // directory where files will be downloaded
  localDownloadDir: "download",

  // local directory with files missing on remote server
  localDataFilesDir: "assets/data",

  // db queries to create, import or drop data
  localDbAssetsDir: "assets/db",

  // currently selected db to import data to
  db: "mysql",

  // settings for MySQL db
  mysql: {
    // connection params; please see complete list of options here:
    // https://github.com/felixge/node-mysql/#connection-options
    connection: {...},

    // db name to import data to
    databaseName: "geonames"
  },

  // flag to overwrite already downloaded files
  forceDownloading: false,

  // action to perform if DB already exists:
  // - Defs.ClearDbAction.None: error will be raised if db exists
  // - Defs.ClearDbAction.Drop: db will be dropped before import
  // - Defs.ClearDbAction.Truncate: all db tables will be truncated
  actionIfDbExists: Defs.ClearDbAction.None
}
```

## Development

Application developed using [Node.js Tools 1.1 RC for Visual Studio 2015](https://github.com/Microsoft/nodejstools) and [TypeScript](http://www.typescriptlang.org/) [v1.6](http://download.microsoft.com/download/6/D/8/6D8381B0-03C1-4BD2-AE65-30FF0A4C62DA/TS1.6-Beta-D14OOB.23301.00/TypeScript_Full.exe).

## Credits

* [GeoNames-MySQL-DataImport](https://github.com/codigofuerte/GeoNames-MySQL-DataImport) for basic SQL scripts;
* [node-status-bar](https://github.com/gagle/node-status-bar) for great status bar on long-running operations.
