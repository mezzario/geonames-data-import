# geonames-data-import

Cross-platform console application written in [Node.js](https://nodejs.org/) to automate downloading/unzipping of [GeoNames](http://www.geonames.org/) worldwide geographical database [dumps](http://download.geonames.org/export/dump/) and importing them to database of choice ([MySQL](https://www.mysql.com/) is supported at the moment).

## Demo

_(some large files were omitted)_

![](https://cloud.githubusercontent.com/assets/2454284/9860210/5cecea10-5b33-11e5-953b-bc0929beb92f.gif)

## Usage

* Install [Node.js](https://nodejs.org/en/download/) and [Docker](https://www.docker.com/products/docker-desktop) (if you plan to run MySQL as a container).

* Clone git repository:
```
git clone https://github.com/mezzario/geonames-data-import.git
```
* From app's folder install node modules:
```
npm i
```
* Edit `src/config.js` to adjust configuration, if needed (see below).

* Start MySQL instance (wait for it to load):
```
npm run mysql
```

* Run application in another terminal window:
```
npm start
```

To automatically run additional SQL queries after import, please refer to file:
```
assets/db/<db-type>/post-import.sql
```

### Configuration

Edit `src/config.js` to adjust app's configuration:

```js
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

  // currently selected db type to import data to
  dbType: "mysql",

  // settings for MySQL db
  mysql: {
    // connection params; please see complete list of options here:
    // https://github.com/felixge/node-mysql/#connection-options
    connection: {...},

    // db name to import data to
    databaseName: "geonames",
  },

  // set to true to overwrite already downloaded files
  forceDownloading: false,

  // action to perform if DB already exists:
  // - ClearDbAction.None: error will be raised if db exists
  // - ClearDbAction.Drop: db will be dropped before import
  // - ClearDbAction.Truncate: all db tables will be truncated
  actionIfDbExists: ClearDbAction.None,
}
```

## Credits

* [GeoNames-MySQL-DataImport](https://github.com/codigofuerte/GeoNames-MySQL-DataImport) for basic SQL scripts;
* [node-status-bar](https://github.com/gagle/node-status-bar) for great status bar on long-running operations.
