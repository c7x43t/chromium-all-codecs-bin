// const sevenBin = require('7zip-bin');
const fs = require('fs');
const path = require('path');
const os = require('os');
const sevenZipBinPath = path.join(__dirname, '7zip-bin');
const sevenBin = require(sevenZipBinPath);
const pathTo7zip = sevenBin.path7za;
const Seven = require('node-7z');
const axios = require('axios');
const { default: axiosRetry } = require('axios-retry');
const { exec } = require('child_process');

const client = axios.create();
const ProgressBar = require('progress');
console.log({ axiosRetry });
axiosRetry(client, { retries: 3 });
const redstar = require('redstar');
const makeDir = require('make-dir');
const rimraf = require('rimraf');

const downloadURLs = {
    linux: "https://github.com/macchrome/linchrome/releases/download/v123.6312.90-M123.0.6312.90-r1262506-portable-ungoogled-Lin64/ungoogled-chromium_123.0.6312.90_1.vaapi_linux.tar.xz",
    mac: "https://github.com/macchrome/macstable/releases/download/v122.6261.115-M122.0.6261.115-r1250580-macOS/Chromium.app.ungoogled-122.0.6261.115.tar.xz",
    win32: "https://github.com/macchrome/winchrome/releases/download/v123.6312.56-M123.0.6312.56-r1262506-Win64/ungoogled-chromium-123.0.6312.56-1_Win64.7z",
    win64: "https://github.com/macchrome/winchrome/releases/download/v123.6312.56-M123.0.6312.56-r1262506-Win64/ungoogled-chromium-123.0.6312.56-1_Win64.7z",
};
function getPlatform() {
    let platform = '';

    const p = os.platform();

    if (p === 'darwin') platform = 'mac';
    else if (p === 'linux') platform = 'linux';
    else if (p === 'win32') {
        platform = os.arch() === 'x64' ? 'win64' : 'win32';
    }
    return platform;
}
async function main() {
    const projectRoot = __dirname;
    const downloadRootDirectory = path.join(projectRoot, '.local-chromium-all-codecs');
    let revision = 706915;

    let platform = getPlatform();// require('./get-platform');
    if (!platform) throw new Error('Unspported platform: ' + platform);
    if (platform === 'mac') {
        revision = 587811;
    }
    if (platform === 'linux') {
        revision = 587811;
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

        console.log({ absExecPath });
        fs.writeFileSync(path.join(__dirname, 'bin-path.txt'), absExecPath, 'utf8');
        // exists already, no need to download
        console.log('Chromium already exists, no need to download.');
    } catch (err) {
        console.log('need to download');
        const url = downloadURLs[platform];
        async function download(url) {
            console.log(`Downloading: ${url}`);

            const destinationPath = path.join(downloadDirectory, `download-${platform}-${revision}-${filename}`);
            if (fs.existsSync(destinationPath)) {
                console.log(`${destinationPath} already exists. Skipping download.`);
                return onFinish(destinationPath); // Exit the function to skip the download
            }
            function onError(err) {
                console.error(err);
                // process.exit(1);
            }
            function onFinish(destinationPath) {
                const sevenStream = Seven.extractFull(destinationPath, downloadDirectory, { $bin: pathTo7zip, $progress: true });
                let progressBar;
                sevenStream.on('progress', function (progress) {
                    // Initialize the progress bar if it hasn't been already
                    if (!progressBar) {
                        progressBar = new ProgressBar('Extracting [:bar] :percent :etas', {
                            complete: '=',
                            incomplete: ' ',
                            width: 20,
                            total: 100 // Total is 100 since progress percent ranges from 0 to 100
                        });
                    }
                    // Update the progress bar with the current progress
                    progressBar.update(progress.percent / 100);
                });
                sevenStream.on('end', function (data) {
                    let ending;
                    if (!!(ending = /\.tar\.(xz|gz|bz2|lz|lzma|Z)$/.exec(destinationPath)?.[1])) {
                        onFinish(destinationPath.slice(0, -(ending.length + 1)));
                    } else {
                        unzipSuccess();
                    }
                });
            }
            client({
                method: 'get',
                url,
                responseType: 'stream'
            }).then(response => {
                const totalBytes = parseInt(response.headers['content-length'], 10);
                let progressBar = new ProgressBar(`Downloading - ${toMegabytes(totalBytes)} [:bar] :percent :etas `, {
                    complete: '=',
                    incomplete: ' ',
                    width: 20,
                    total: totalBytes
                });
                let downloadedBytes = 0;

                const writer = fs.createWriteStream(destinationPath); // Make sure `destinationPath` is defined
                response.data.on('data', chunk => {
                    downloadedBytes += chunk.length;
                    progressBar.tick(chunk.length);
                });
                response.data.pipe(writer);

                writer.on('finish', () => onFinish(destinationPath)); // Ensure `onFinish` is defined
                writer.on('error', onError); // Ensure `onError` is defined
            }).catch(onError);
            async function unzipSuccess() {
                console.log('\nUnzip Success!');

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
                    // rimraf.sync(zipPath);
                } catch (err) {
                    // should exist now that we just downloaded it...
                    throw new Error('Failed to download Chromium');
                }
            }
        }
        download(url);
    }
}
function toMegabytes(bytes) {
    const mb = bytes / 1024 / 1024;
    return `${Math.round(mb * 10) / 10} Mb`;
}
main();