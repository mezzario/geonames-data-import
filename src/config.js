require('dotenv').config();

const ClearDbAction = {
  None: 0,
  Truncate: 1,
  Drop: 2,
};

const config = {
  baseUrl: 'http://download.geonames.org/export', // base URL do download files from

  dataFilePaths: [
    // list of file paths to download (relative to 'baseUrl')
    'dump/admin1CodesASCII.txt',
    'dump/admin2Codes.txt',
    'dump/allCountries.zip',
    'dump/alternateNames.zip',
    'local:dump/continentCodes.txt',
    'dump/countryInfo.txt',
    'dump/featureCodes_en.txt',
    'dump/hierarchy.zip',
    'dump/iso-languagecodes.txt',
    'dump/timeZones.txt',
    'zip/allCountries.zip',
  ],

  localDownloadDir: 'download', // directory where files will be downloaded
  localDataFilesDir: 'assets/data', // local directory with files missing on remote server
  localDbAssetsDir: 'assets/db', // db queries to create, import or drop data

  dbType: 'mysql', // currently selected db type to import data to

  mysql: {
    // connection params for MySQL
    // https://github.com/mysqljs/mysql?tab=readme-ov-file#connection-options
    connection: {
      host: '127.0.0.1',
      port: '3306',
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASS || 'root',
    },
    databaseName: 'geonames', // db name to import data to
  },

  forceDownloading: false, // flag to overwrite already downloaded files

  // action to perform if DB already exists:
  // - ClearDbAction.None: error will be raised if db exists
  // - ClearDbAction.Drop: db will be dropped before import
  // - ClearDbAction.Truncate: all db tables will be truncated
  actionIfDbExists: ClearDbAction.None,
};

exports.default = config;
exports.ClearDbAction = ClearDbAction;
