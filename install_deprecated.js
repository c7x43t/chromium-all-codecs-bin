const downloadURLs = {
  linux: 'https://github.com/macchrome/linchrome/releases/download/v131.6778.244-M131.0.6778.244-r1368529-portable-ungoogled-Lin64/ungoogled-chromium_131.0.6778.244_1.vaapi_linux.tar.xz',
  //linux: 'https://www.googleapis.com/download/storage/v1/b/chromium-browser-snapshots/o/Linux_x64%2F1065920%2Fchrome-linux.zip?generation=1667312947566470&alt=media',
  // linux: "https://github.com/macchrome/linchrome/releases/download/v123.6312.90-M123.0.6312.90-r1262506-portable-ungoogled-Lin64/ungoogled-chromium_123.0.6312.90_1.vaapi_linux.tar.xz"
  mac:
    "https://github.com/macchrome/macstable/releases/download/v131.6778.251-M131.0.6778.251-r1368529-macOS/Chromium.app.ungoogled-131.0.6778.251.tar.xz",
  win32:
    "https://github.com/macchrome/winchrome/releases/download/v132.6834.97-M132.0.6834.97-r1381561-Win64/ungoogled-chromium-132.0.6834.97-1_Win64.7z",
  win64:
    "https://github.com/macchrome/winchrome/releases/download/v132.6834.97-M132.0.6834.97-r1381561-Win64/ungoogled-chromium-132.0.6834.97-1_Win64.7z",
};

const os = require('os');
const fs = require('fs');
const path = require('path');

const rimraf = require('rimraf');
const extractZip = require('extract-zip');
const crossZip = require('cross-unzip');
const makeDir = require('make-dir');

function unzip(zipPath, dirPath, callback) {
  const ext = path.extname(zipPath);
  if (ext.indexOf('7z') >= 0) {
    return crossZip.unzip(zipPath, dirPath, callback);
  } else if (ext.indexOf('tar.xz') >= 0) {
    const exec = require('child_process').exec;
    const cmd = `tar -xvf ${zipPath} -C ${dirPath}`;
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        console.error(`exec error: ${error}`);
        return;
      }
      if (stderr) {
        console.error(`stderr: ${stderr}`);
        return;
      }
      callback();
    });
  }
  return extractZip(zipPath, { dir: dirPath }, callback);
}

const https = require('https');
const http = require('http');

const redstar = require('redstar');

let revision = 706915;

main();

async function main() {
  const projectRoot = __dirname;
  const downloadRootDirectory = path.join(projectRoot, '.local-chromium-all-codecs');

  let platform = require('./get-platform.js');

  if (!platform) throw new Error('Unspported platform: ' + p);

  if (platform === 'mac') {
    // use older/stable version for mac
    // had many page crashes when playing youtube videos
    // could not find reliable issue after few days of debugging
    revision = 587811;
  }

  if (platform === 'linux') {
    revision = 587811;

    // console.log()
    // console.log( 'See download/install instructions from here: ' )
    // console.log(
    //   'https://chromium.woolyss.com/#linux'
    // )
    // return
  }

  let execName = 'chrome.exe';
  let execPath = '';
  let downloadDirectory = downloadRootDirectory;
  let filename = '';
  if (platform === 'mac') {
    downloadDirectory = path.join(downloadRootDirectory, 'mac-' + revision);
    execName = 'Chromium';
  } else if (platform === 'linux') {
    downloadDirectory = path.join(downloadRootDirectory, 'linux-' + revision);
    filename = downloadURLs['linux']
      .split('/').pop()
      .replace(/\?.*/, '');
    execName = 'chrome';
  } else if (platform === 'win32') {
    downloadDirectory = path.join(downloadRootDirectory, 'win32-' + revision);
    filename = downloadURLs['win32']
      .split('/').pop()
      .replace(/\?.*/, '');
    execName = 'chrome.exe';
  } else if (platform === 'win64') {
    downloadDirectory = path.join(downloadRootDirectory, 'win64-' + revision);
    filename = downloadURLs['win64']
      .split('/').pop()
      .replace(/\?.*/, '');
    execName = 'chrome.exe';
  } else throw new Error('Unspported platform: ' + platform);

  // find bin path through glob pattern
  const execPromise = new Promise(function (resolve) {
    redstar(path.join(downloadDirectory, '**/' + execName), function (err, files, dirs) {
      resolve(files[0] || '');
    });
  });

  execPath = await execPromise;

  if (execPath) {
    execPath = path.relative(process.cwd(), execPath);
  }

  // make sure download directory exists
  makeDir.sync(downloadDirectory);

  try {
    const s = fs.statSync(execPath);
    const absExecPath = path.resolve(execPath);
    fs.writeFileSync(path.join(__dirname, 'bin-path.txt'), absExecPath, 'utf8');
    // exists already, no need to download
    console.log('Chromium already exists, no need to download.');
  } catch (err) {
    // doesn't exist, need to download
    console.log('need to download');
    const url = downloadURLs[platform];

    download(url);
    function download(url) {
      const params = require('url').parse(url);
      // params.port = 443
      // params.method = 'GET'

      // console.log( params )

      const h = (params.protocol === 'https:') ? https : http;

      const destinationPath = path.join(downloadDirectory, `download-${platform}-${revision}-${filename}`);
      if (fs.existsSync(destinationPath)) {
        console.log(`${destinationPath} already exists. Skipping download.`);
        return onFinish(); // Exit the function to skip the download
      }
      let downloadedBytes = 0;
      let totalBytes = 0;

      console.log('downloading...');
      const req = h.request(params, function (res) {
        // handle redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          console.log('(redirect: ' + res.statusCode + ')');
          return download(res.headers.location);
        }

        if (res.statusCode !== 200) {
          const error = new Error(`Download failed: server returned code ${res.statusCode}. URL: ${url}`);
          // consume response data to free up memory
          res.resume();
          throw error;
        }
        console.log('res.status: ' + res.statusCode);

        totalBytes = Number(res.headers['content-length']);

        const file = fs.createWriteStream(destinationPath);
        file.on('finish', onFinish);
        file.on('error', onError);
        res.pipe(file);

        res.on('data', onData);
      });

      req.on('error', onError);
      req.end();

      function onData(chunk) {
        downloadedBytes += chunk.length;
        onProgress(downloadedBytes, totalBytes);
      }

      function onFinish() {
        console.log('Download Finished! Unzipping...');

        // unzip
        const zipPath = destinationPath;
        unzip(zipPath, downloadDirectory, async function (err) {
          if (err) throw err;
          console.log('Unzip Success!');

          // find bin path through glob pattern
          const execPromise = new Promise(function (resolve) {
            redstar(path.join(downloadDirectory, '**/' + execName), function (err, files, dirs) {
              resolve(files[0] || '');
            });
          });

          execPath = await execPromise;

          if (execPath) {
            execPath = path.relative(process.cwd(), execPath);
          }

          try {
            const s = fs.statSync(execPath);
            const absExecPath = path.resolve(execPath);
            fs.writeFileSync(path.join(__dirname, 'bin-path.txt'), absExecPath, 'utf8');

            // exists already, no need to download
            console.log('Chromium downloaded successfully!');
            console.log('Chromium: ' + execPath);

            // delete zipfile
            rimraf.sync(zipPath);
          } catch (err) {
            // should exist now that we just downloaded it...
            throw new Error('Failed to download Chromium');
          }
        });
      }

      function onError(err) {
        throw err;
      }
    }
  }
}

let progressBar = null;
let lastDownloadedBytes = 0;
function onProgress(downloadedBytes, totalBytes) {
  if (!progressBar) {
    // initialize progress bar if it doesn't exist
    const ProgressBar = require('progress');
    progressBar = new ProgressBar(`Downloading Chromium r${revision} - ${toMegabytes(totalBytes)} [:bar] :percent :etas `, {
      complete: '=',
      incomplete: ' ',
      width: 20,
      total: totalBytes
    });
  }
  const delta = downloadedBytes - lastDownloadedBytes;
  lastDownloadedBytes = downloadedBytes;
  progressBar.tick(delta);
}

function toMegabytes(bytes) {
  const mb = bytes / 1024 / 1024;
  return `${Math.round(mb * 10) / 10} Mb`;
}
