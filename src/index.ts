/* eslint-disable no-console */

import * as util from 'util';
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as unzipper from 'unzipper';
import * as statusBarModule from 'status-bar';
import * as mysql from 'mysql2/promise';
import moment from 'moment';
import 'moment-duration-format';
import config, {ClearDbAction} from './config';

async function main(): Promise<void> {
  const startMoment = moment();
  let downloadsCount = 0;

  console.log('\nDownloading and unzipping files...');

  // Process files sequentially.
  for (const dataFilePath of config.dataFilePaths) {
    downloadsCount = await processFile(dataFilePath, downloadsCount);
  }

  if (!downloadsCount) {
    console.log(
      "All files are already there, skipping (modify 'forceDownloading' in config)."
    );
  }

  if (config.dbType === 'mysql') {
    const importsPerformed = await processMySqlImport();
    if (importsPerformed) {
      console.log(
        `All operations completed in ${durationSince(startMoment)}.\n`
      );
    }
  }
}

// Process a single file (download or copy).
async function processFile(
  dataFilePath: string,
  downloadsCount: number
): Promise<number> {
  const baseUrl = config.baseUrl.replace(/\/+$/, '');
  const localFileRe = /^local:/;

  const isLocal = Boolean(dataFilePath.match(localFileRe));
  const normalizedPath = dataFilePath.replace(localFileRe, '');
  const fileSubpath = path.normalize(normalizedPath);
  const filePath = path.join(config.localDownloadDir, fileSubpath);
  const localFilePath = isLocal
    ? path.join(config.localDataFilesDir, fileSubpath)
    : null;

  if (
    config.forceDownloading ||
    !fs.existsSync(filePath.replace(/\.\w+$/, '.txt'))
  ) {
    if (++downloadsCount === 1) {
      console.log();
    }

    if (isLocal && localFilePath) {
      // File is stored locally: just copy it to downloads dir.
      await copyFileLocally(normalizedPath, localFilePath, filePath);
    } else {
      // Download from server.
      await downloadFile(normalizedPath, baseUrl);
    }
  }
  return downloadsCount;
}

// Process MySQL import tasks.
async function processMySqlImport(): Promise<boolean> {
  const localDbAssetsDir = path.join(config.localDbAssetsDir, config.dbType);
  const databaseName = config.mysql.databaseName;

  // Load SQL query templates.
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

  try {
    // Check if database exists.
    const result = await runMySqlQuery(`show databases like '${databaseName}'`);
    const databaseExists = !!result.rows.length;

    console.log();

    // Handle existing database according to config.
    if (databaseExists) {
      switch (config.actionIfDbExists) {
        case ClearDbAction.Truncate:
          await runMySqlQuery(
            truncDbQuery,
            `Database '${databaseName}' exists, truncating it...`
          );
          break;
        case ClearDbAction.Drop:
          await runMySqlQuery(
            dropDbQuery,
            `Database '${databaseName}' exists, dropping it...`
          );
          break;
      }
    }

    if (!databaseExists || config.actionIfDbExists === ClearDbAction.Drop) {
      await runMySqlQuery(
        createDbQuery,
        `Creating database '${databaseName}'...`
      );
    }

    if (databaseExists && config.actionIfDbExists === ClearDbAction.None) {
      console.log(
        "Database exists, skipping import (modify 'actionIfDbExists' in config).\n"
      );
      return false;
    }

    console.log();

    // Import data files.
    await importDataFiles(localDbAssetsDir, databaseName);

    // Run post-import query if exists.
    if (postImportQuery) {
      await runMySqlQuery(
        `use ${databaseName};\n${postImportQuery}`,
        'Running post import query...'
      );
      console.log();
    }

    return true;
  } catch (error) {
    console.error('An error occurred:', error);
    return false;
  }
}

// Import all data files.
async function importDataFiles(
  localDbAssetsDir: string,
  databaseName: string
): Promise<void> {
  const filePaths = getFilePathsRecursively(
    path.normalize(config.localDownloadDir)
  ).filter((s) => /\.txt$/i.test(s));

  for (let i = 0; i < filePaths.length; i++) {
    const filePath = filePaths[i].replace(/^[/\\]+/, '').replace(/[/\\]+$/, '');

    const fileSubpath = filePath
      .substr(
        config.localDownloadDir.replace(/^[/\\]+/, '').replace(/[/\\]+$/, '')
          .length
      )
      .replace(/^[/\\]+/, '');

    const importQueryPath = path.join(
      localDbAssetsDir,
      'import',
      fileSubpath.replace(/\.\w+$/, '.sql')
    );

    const absoluteFilePath = filePaths[i].replace(/\\/g, '/');

    const query = util.format(
      fs.readFileSync(importQueryPath, {encoding: 'utf8'}),
      databaseName,
      absoluteFilePath
    );

    await runMySqlQuery(query, `Importing file '${filePath}'...`);

    if (i === filePaths.length - 1) {
      console.log();
    }
  }
}

// Helper function to copy a file locally.
async function copyFileLocally(
  dataFilePath: string,
  localFilePath: string,
  filePath: string
): Promise<void> {
  process.stdout.write(`${dataFilePath}: copying locally...`);

  try {
    await fs.copy(localFilePath, filePath);
    console.log(' Done.');
  } catch (error) {
    console.error(`\n${error}\n`);
    throw error;
  }
}

async function downloadFile(
  fileUrlSubpath: string,
  baseUrl: string
): Promise<void> {
  fileUrlSubpath = fileUrlSubpath.replace(/^\/+/, '');

  const fileUrl = `${baseUrl}/${fileUrlSubpath}`;
  const fileSubpath = path.normalize(fileUrlSubpath);
  const fileDir = path.join(config.localDownloadDir, path.dirname(fileSubpath));
  const fileName = path.basename(fileSubpath);
  const filePath = path.join(fileDir, fileName);

  return new Promise<void>((resolve, reject) => {
    let completed = false;
    let statusBar: StatusBarType;

    const completeOnce = (fn: () => void) => {
      if (!completed) {
        completed = true;
        fn();
      }
    };

    const resolveOnce = () => completeOnce(resolve);
    const rejectOnce = (error: Error) =>
      completeOnce(() => {
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
          rejectOnce(
            new Error(
              `${fileUrlSubpath}: server returned ${response.statusCode}, aborting.`
            )
          );
          return;
        }

        statusBar = statusBarModule
          .create({total: Number(response.headers['content-length'])})
          .on('render', (stats: StatsType) => {
            let displayName = fileUrlSubpath;
            const maxLength = (process.stdout.columns || 80) - 1 - 59;
            // Format display name.
            if (displayName.length > maxLength) {
              displayName = displayName.slice(0, maxLength - 3) + '...';
            } else {
              displayName = displayName.padEnd(maxLength);
            }
            const size = statusBar.format.storage(stats.currentSize);
            const speed = statusBar.format.speed(stats.speed);
            const time = statusBar.format.time(stats.remainingTime);
            const progress = statusBar.format.progressBar(stats.percentage);
            const percent = statusBar.format.percentage(stats.percentage);

            process.stdout.write(
              `${displayName} ${size} ${speed} ${time} [${progress}] ${percent}`
            );
            process.stdout.cursorTo(0);
          })
          .on('finish', () => {
            console.log();
            resolveOnce();
          }) as StatusBarType;

        response.pipe(statusBar as any);

        // Determine if we should extract or save directly.
        const isZip = path.extname(fileName).toLowerCase() === '.zip';
        response.pipe(
          isZip
            ? unzipper.Extract({path: fileDir}).on('error', rejectOnce)
            : fs.createWriteStream(filePath).on('error', rejectOnce)
        );
      });

      request.on('error', rejectOnce);
    } catch (error) {
      rejectOnce(error as Error);
    }
  });
}

function readQueryFromFile(fileName: string, ...args: string[]): string {
  if (!fs.existsSync(fileName)) {
    throw new Error(`SQL file not found: ${fileName}`);
  }
  let query = fs.readFileSync(fileName, {encoding: 'utf8'}).trim();
  if (query && args.length) {
    query = util.format.apply(util, [query].concat(args));
  }
  return query;
}

async function runMySqlQuery(
  query: string,
  message?: string
): Promise<QueryResult> {
  if (message) {
    process.stdout.write(message);
  }
  const opMoment = moment();
  const connectionOptions = {
    ...config.mysql.connection,
    multipleStatements: true,
    infileStreamFactory: (path: string) => fs.createReadStream(path),
  };
  const connection = await mysql.createConnection(connectionOptions);
  try {
    const [rows, fields] = await connection.query(query);
    if (message) {
      console.log(` Done in ${durationSince(opMoment)}.`);
    }
    return {rows: rows as any[], fields: fields as any[]};
  } catch (error) {
    if (message) {
      console.log(' Failed.');
    }
    console.error(`\n${error}\n`);
    throw error;
  } finally {
    await connection.end();
  }
}

function getFilePathsRecursively(dir: string): string[] {
  let filePaths: string[] = [];
  const walk = (dirPath: string): void => {
    const files = fs.readdirSync(dirPath);
    files.forEach((name) => {
      const filePath = path.join(dirPath, name);
      if (fs.statSync(filePath).isDirectory()) {
        walk(filePath);
      } else {
        filePaths.push(filePath);
      }
    });
  };
  walk(dir);
  return filePaths;
}

function durationSince(m: moment.Moment): string {
  return moment
    .duration(moment().diff(m))
    .format('y[y] M[mo] d[d] h[h] m[m] s[s]');
}

// Start the application.
main().catch((error) => console.error('Application error:', error));

interface StatsType {
  currentSize: number;
  speed: number;
  remainingTime: number;
  percentage: number;
}

interface StatusBarType {
  format: {
    storage: (size: number) => string;
    speed: (speed: number) => string;
    time: (time: number) => string;
    progressBar: (percentage: number) => string;
    percentage: (percentage: number) => string;
  };
  on(event: string, callback: (stats: StatsType) => void): StatusBarType;
  cancel(): void;
}

interface QueryResult {
  rows: any[];
  fields: any[];
}

// Add moment duration format type extension.
declare module 'moment' {
  interface Duration {
    format: (template: string) => string;
  }
}
