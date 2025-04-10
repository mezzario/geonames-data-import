import dotenv from 'dotenv';
dotenv.config();

export enum ClearDbAction {
  /** Error will be raised if db exists. */
  None = 0,
  /** All db tables will be truncated. */
  Truncate = 1,
  /** DB will be dropped before import. */
  Drop = 2,
}

const config = {
  /** Base URL to download files from. */
  baseUrl: 'http://download.geonames.org/export',
  /** List of file paths to download (relative to 'baseUrl'). */
  dataFilePaths: [
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
  /** Directory where files will be downloaded. */
  localDownloadDir: 'download',
  /** Local directory with files missing on remote server. */
  localDataFilesDir: 'assets/data',
  /** DB queries to create, import or drop data. */
  localDbAssetsDir: 'assets/db',
  /** Currently selected DB type to import data to. */
  dbType: 'mysql',
  mysql: {
    /** Connection params for MySQL. */
    connection: {
      host: '127.0.0.1',
      port: 3306,
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASS || 'root',
    },
    /** DB name to import data to. */
    databaseName: 'geonames',
  },
  /** Flag to overwrite already downloaded files. */
  forceDownloading: false,
  /** Action to perform if DB already exists. */
  actionIfDbExists: ClearDbAction.None,
};

export default config;
