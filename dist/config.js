"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClearDbAction = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
var ClearDbAction;
(function (ClearDbAction) {
    /** Error will be raised if db exists. */
    ClearDbAction[ClearDbAction["None"] = 0] = "None";
    /** All db tables will be truncated. */
    ClearDbAction[ClearDbAction["Truncate"] = 1] = "Truncate";
    /** DB will be dropped before import. */
    ClearDbAction[ClearDbAction["Drop"] = 2] = "Drop";
})(ClearDbAction || (exports.ClearDbAction = ClearDbAction = {}));
const config = {
    /** Base URL to download files from. */
    baseUrl: 'http://download.geonames.org/export',
    /**
     * List of file paths to download (relative to `baseUrl`).
     * Files prefixed with 'local:' will be sourced from `localDataFilesDir`
     * instead of being downloaded from the 'baseUrl'.
     */
    dataFilePaths: [
        'dump/admin1CodesASCII.txt',
        'dump/admin2Codes.txt',
        // Complete dataset.
        'dump/allCountries.zip',
        'dump/alternateNames.zip',
        'local:dump/continentCodes.txt',
        'dump/countryInfo.txt',
        'dump/featureCodes_en.txt',
        'dump/hierarchy.zip',
        'dump/iso-languagecodes.txt',
        'dump/timeZones.txt',
        // Smaller, potentially summarized or differently structured version of
        // "allCountries.zip". This is a different file from
        // 'dump/allCountries.zip' above - both are intentionally included.
        // See http://download.geonames.org/export/zip/readme.txt for more details.
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
exports.default = config;
//# sourceMappingURL=config.js.map