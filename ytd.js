#!/usr/bin/env node

const ytdl = require('ytdl-core');
const fs = require('fs-extra');
const ffmpeg = require('ffmpeg-static');
const { spawn } = require('child_process');
const prompts = require('prompts');
const chalk = require('chalk');
const cliProgress = require('cli-progress');
const path = require('path');
const { Command } = require('commander');

const program = new Command()
    .version(require('./package.json').version)
    .argument('[url]', 'youtube video url')
    .action(url => {
        askForVideoUrl(url);
    });

program.parse();

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
        fs.rm(path.join(__dirname, 'temp/output.mp4')),
        fs.rm(path.join(__dirname, 'temp/video')),
        fs.rm(path.join(__dirname, 'temp/audio')),
    ]);
}

function downloadAudio(videoUrl, videoInfo) {
    const title = videoInfo.videoDetails.title.replace(/[/\\?%*:|"<>]/g, '-');
    const titleTrimmed = title.length > 20 ? title.substring(0, 20 - 3).trim() + "..." : title;
    const downloadBar = new cliProgress.SingleBar({
        format: `Downloading & encoding |${titleTrimmed}| ${chalk.blueBright('{bar}')} {percentage}% | {valueU}/{totalU}`,
        barCompleteChar: '\u2588',
        barIncompleteChar: '\u2591',
    });

    const audioReadStream = ytdl(videoUrl, { quality: 'highestaudio', filter: format => format.container === 'mp4' && !format.hasVideo });
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
            'inherit', 'inherit', 'inherit',
            'pipe', 'pipe',
        ],
    });

    ffmpegProcess.on('close', () => {
        downloadBar.stop();
        fs.rename(path.join(__dirname, 'temp/output.mp3'), path.join(__dirname, `downloaded/audio/${title}.mp3`));
        cleanup().catch(() => { });
        console.log(`Done. Saved as ${title}.mp3`);
    });

    audioReadStream.pipe(ffmpegProcess.stdio[4]);
}

function downloadVideo(format, videoUrl, videoInfo) {
    const title = videoInfo.videoDetails.title.replace(/[/\\?%*:|"<>]/g, '-');
    const titleTrimmed = title.length > 25 ? title.substring(0, 25 - 3).trim() + "..." : title;
    const downloadBar = new cliProgress.MultiBar({
        format: `{streamName} |${chalk.blueBright('{bar}')}| {percentage}% | {valueU}/{totalU}`,
        barCompleteChar: '\u2588',
        barIncompleteChar: '\u2591',
    });

    const videoReadStream = ytdl(videoUrl, { format });
    const audioReadStream = ytdl(videoUrl, { quality: 'highestaudio', filter: format => format.container === 'mp4' && !format.hasVideo });

    console.log(`Downloading ${chalk.bold(titleTrimmed)}`);

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
        '-loglevel', '8', '-hide_banner',
        '-progress', 'pipe:3',
        '-i', 'pipe:4',
        '-i', 'pipe:5',
        '-c', 'copy',
        '-strict', '-2',
        'temp/output.mp4',
    ], {
        windowsHide: true,
        stdio: [
            'inherit', 'inherit', 'inherit',
            'pipe', 'pipe', 'pipe',
        ],
    });

    ffmpegProcess.on('close', () => {
        downloadBar.stop()
        fs.rename(path.join(__dirname, 'temp/output.mp4'), path.join(__dirname, `downloaded/${title}.mp4`)).catch(err => {console.log(`Cannot move file: ${err}`.brightRed)});
        cleanup().catch(() => { });
        console.log(`Done. Saved as ${title}.mp4`);
    });

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

async function askForVideoUrl(arg = '') {
    if (!fs.pathExistsSync(path.join(__dirname, 'downloaded'))) fs.mkdir(path.join(__dirname, 'downloaded'));
    if (!fs.pathExistsSync(path.join(__dirname, 'downloaded/audio'))) fs.mkdir(path.join(__dirname, 'downloaded/audio'));
    if (!fs.pathExistsSync(path.join(__dirname, 'temp'))) fs.mkdir(path.join(__dirname, 'temp'));
    fs.emptyDir(path.join(__dirname, 'temp'));

    let videoUrl = arg.trim();

    if (!arg) {
        const result = await prompts({
            name: 'url',
            message: 'Video URL',
            type: 'text',
            validate: value => ytdl.validateURL(value) ? true : 'Invalid video URL!',
        }, {
            onCancel: cancel,
        });
    
        videoUrl = result.url;
    }
    else if (!ytdl.validateURL(arg)) return console.log('Invalid video URL!'.red);

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

    askForOptions(resolutions, videoUrl, videoInfo);
}
