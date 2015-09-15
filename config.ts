import Defs = require("./lib/defs");

var config = {
	baseUrl: "http://download.geonames.org/export", // base URL do download files from
	dataFilePaths: [ // list of file paths to download (relative to 'baseUrl')
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

	localDownloadDir: "download",     // directory where files will be downloaded
	localDataFilesDir: "assets/data", // local directory with files missing on remote server
	localDbAssetsDir: "assets/db",    // db queries to create, import or drop data

	db: "mysql", // currently selected db to import data to
	mysql: { // settings for MySQL db
		connection: { // connection params -> https://github.com/felixge/node-mysql/#connection-options
			//host: "localhost",
			//port: "3306",
			socketPath: "/tmp/mysql.sock",
			user: "root",
			password: "root"
		},
		databaseName: "geonames" // db name to import data to
	},

	forceDownloading: false, // flag to overwrite already downloaded files
	actionIfDbExists: Defs.ClearDbAction.None // action to perform if DB already exists
};

export = config;
