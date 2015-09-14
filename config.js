var Defs = require("./lib/defs");
var config = {
    baseUrl: "http://download.geonames.org/export",
    dataFilePaths: [
        "dump/admin1CodesASCII.txt",
        "dump/admin2Codes.txt",
        "dump/allCountries.zip",
        "dump/alternateNames.zip",
        "local:dump/continentCodes.txt",
        "dump/countryInfo.txt",
        "dump/featureCodes_en.txt",
        "dump/hierarchy.zip",
        "dump/iso-languagecodes.txt",
        "dump/timeZones.txt",
        "zip/allCountries.zip"
    ],
    localDownloadDir: "download",
    localDataFilesDir: "assets/data",
    localDbAssetsDir: "assets/db",
    db: "mysql",
    mysql: {
        connection: {
            //host: "localhost",
            //port: "3306",
            socketPath: "/tmp/mysql.sock",
            user: "root",
            password: "root"
        },
        databaseName: "geonames"
    },
    forceDownloading: false,
    actionIfDbExists: Defs.ClearDbAction.None
};
module.exports = config;
//# sourceMappingURL=config.js.map