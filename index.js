const ytdl = require('ytdl-core');
const fs = require('fs-extra');
const ffmpeg = require('ffmpeg-static');
const { execSync, spawn } = require('child_process');
const prompts = require('prompts');
const colors = require('colors');
const cliProgress = require('cli-progress');

// this https://github.com/fent/node-ytdl-core/blob/HEAD/example/ffmpeg.js
// and this https://github.com/fent/node-ytdl-core/blob/f47dd0d5ffcd07c68b12a38d1747813016d069f4/example/progress.js

function cancel() {
    process.exit(130);
}

function formatBytes(bytes, decimals = 2) { // stolen from https://stackoverflow.com/a/18650828
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

async function cleanup() {
    return await Promise.all([
        fs.rm('temp/output.mp4'),
        fs.rm('temp/video'),
        fs.rm('temp/audio'),
    ]);
}

function downloadAudio(videoUrl, videoInfo) {
    const title = videoInfo.videoDetails.title.replace(/[/\\?%*:|"<>]/g, '-');
    const titleTrimmed = title.length > 20 ? title.substring(0, 20 - 3).trim() + "..." : title;
    const downloadBar = new cliProgress.SingleBar({
        format: `Downloading & encoding |${titleTrimmed}| ${'{bar}'.green} {percentage}% | {valueU}/{totalU}`,
        barCompleteChar: '\u2588',
        barIncompleteChar: '\u2591',
    });

    const audioReadStream = ytdl(videoUrl, { quality: 'highestaudio', filter: format => format.container === 'mp4' && !format.hasVideo });
    // const writeStream = audioReadStream.pipe(fs.createWriteStream('temp/audio'));
    downloadBar.start(100, 0, {
        valueU: '0 MB',
        totalU: 'X MB',
    });

    audioReadStream.on('progress', (chunkLength, downloaded, total) => {
        downloadBar.setTotal(total);
        downloadBar.update(downloaded, {
            valueU: formatBytes(downloaded, 2),
            totalU: formatBytes(total, 2),
        });
    });

    const ffmpegProcess = spawn(ffmpeg, [
        '-loglevel', '8', '-hide_banner',
        '-progress', 'pipe:3',
        '-i', 'pipe:4',
        '-b:a', '192K',
        '-map', '0:a',
        'temp/output.mp3',
    ], {
        windowsHide: true,
        stdio: [
            /* Standard: stdin, stdout, stderr */
            'inherit', 'inherit', 'inherit',
            /* Custom: pipe:3, pipe:4 */
            'pipe', 'pipe',
        ],
    });

    ffmpegProcess.on('close', () => {
        downloadBar.stop();
        fs.rename('temp/output.mp3', `downloaded/audio/${title}.mp3`);
        cleanup().catch(() => { });
        console.log(`Done. Saved as ${title}.mp3`);
    });

    // ffmpegProcess.stdio[3].on('data', console.log);
    audioReadStream.pipe(ffmpegProcess.stdio[4]);
}

function downloadVideo(format, videoUrl, videoInfo) {
    const title = videoInfo.videoDetails.title.replace(/[/\\?%*:|"<>]/g, '-');
    const titleTrimmed = title.length > 25 ? title.substring(0, 25 - 3).trim() + "..." : title;
    const downloadBar = new cliProgress.MultiBar({
        format: `{streamName} |${'{bar}'.green}| {percentage}% | {valueU}/{totalU}`,
        barCompleteChar: '\u2588',
        barIncompleteChar: '\u2591',
    });

    const videoReadStream = ytdl(videoUrl, { format });
    const audioReadStream = ytdl(videoUrl, { quality: 'highestaudio', filter: format => format.container === 'mp4' && !format.hasVideo });

    console.log(`Downloading ${titleTrimmed}`.bold);

    const audioBar = downloadBar.create(2137, 0, {
        valueU: '0 MB',
        totalU: 'X MB',
        streamName: 'Audio',
    });

    const videoBar = downloadBar.create(420, 0, {
        valueU: '0 MB',
        totalU: 'X MB',
        streamName: 'Video',
    });

    videoReadStream.on('progress', (chunkLength, downloaded, total) => {
        videoBar.setTotal(total);
        videoBar.update(downloaded, {
            valueU: formatBytes(downloaded, 2),
            totalU: formatBytes(total, 2),
        });
    });

    audioReadStream.on('progress', (chunkLength, downloaded, total) => {
        audioBar.setTotal(total);
        audioBar.update(downloaded, {
            valueU: formatBytes(downloaded, 2),
            totalU: formatBytes(total, 2),
        });
    });

    const ffmpegProcess = spawn(ffmpeg, [
        '-loglevel', '8', '-hide_banner',  //bruh -hide_banner -loglevel error -y -i temp/video -i temp/audio -c copy -strict -2 temp/output.mp4
        '-progress', 'pipe:3',
        '-i', 'pipe:4',
        '-i', 'pipe:5',
        '-c', 'copy',
        '-strict', '-2',
        'temp/output.mp4',
    ], {
        windowsHide: true,
        stdio: [
            /* Standard: stdin, stdout, stderr */
            'inherit', 'inherit', 'inherit',
            /* Custom: pipe:3, pipe:4, pipe:5 */
            'pipe', 'pipe', 'pipe',
        ],
    });

    ffmpegProcess.on('close', () => {
        downloadBar.stop()
        fs.rename('temp/output.mp4', `downloaded/${title}.mp4`).catch(err => {console.log(`Cannot move file: ${err}`.brightRed)});
        cleanup().catch(() => { });
        console.log(`Done. Saved as ${title}.mp4`);
    });

    // ffmpegProcess.stdio[3].on('data', console.log);
    videoReadStream.pipe(ffmpegProcess.stdio[4]);
    audioReadStream.pipe(ffmpegProcess.stdio[5]);
}

async function askForOptions(resolutions, videoUrl, videoInfo) {
    const choices = [{ title: 'audio', value: 'audio'}];
    resolutions.forEach(format => {
        choices.push({ title: format.label, value: format.ytdlFormat });
    });
    const result = await prompts({
        choices,
        name: 'format',
        type: 'select',
        message: 'Select quality',
    }, {
        onCancel: cancel,
    });

    if (result.format === 'audio') downloadAudio(videoUrl, videoInfo);
    else downloadVideo(result.format, videoUrl, videoInfo);
}

async function askForVideoUrl() {
    if (!fs.pathExistsSync('downloaded')) fs.mkdir('downloaded');
    if (!fs.pathExistsSync('downloaded/audio')) fs.mkdir('downloaded/audio');
    if (!fs.pathExistsSync('temp')) fs.mkdir('temp');
    fs.emptyDir('temp');

    const result = await prompts({
        name: 'url',
        message: 'Video URL',
        type: 'text',
        validate: value => ytdl.validateURL(value) ? true : 'Bad video URL!',
    }, {
        onCancel: cancel,
    });

    const videoUrl = result.url;

    const videoInfo = await ytdl.getInfo(videoUrl).catch(err => {
        console.log('Sorry, can\'t download this video'.brightYellow);
        return askForVideoUrl();
    });

    if (!videoInfo) return;

    const resolutions = [];

    videoInfo.formats.forEach(formatData => {
        const format = {
            ytdlFormat: formatData,
            label: `${formatData.qualityLabel} - ${formatBytes(formatData.contentLength)}`,
        }
        if (formatData.qualityLabel && formatData.container === 'mp4' && !formatData.hasAudio && !resolutions.includes(format)) resolutions.push(format);
    });

    console.log(resolutions)

    askForOptions(resolutions, videoUrl, videoInfo);
}

askForVideoUrl();