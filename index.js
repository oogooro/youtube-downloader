const ytdl = require('ytdl-core');
const fs = require('fs');
const { execSync } = require('child_process');

const readline = require("readline");
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function connectAudioVideo(title) {
    console.log('Connecting audio + video');
    if (fs.existsSync('temp/output.mp4')) fs.rmSync('temp/output.mp4');
    execSync(`ffmpeg -hide_banner -loglevel error -i temp/video.mp4 -i temp/audio.mp3 -c copy -shortest temp/output.mp4`);
    fs.copyFileSync('temp/output.mp4', `downloaded/${title}.mp4`);

    console.log('Cleaning...')
    try{
        fs.rmSync('temp/output.mp4');
        fs.rmSync('temp/video.mp4');
        fs.rmSync('temp/audio.mp3');
        console.log('Cleaning done.')
    }
    catch(err) {
        console.log(`Faied to clean ${err}`);
    }

    console.log(`Done. Saved as ${title}.mp4`);
}

rl.question('Youtube video URL: ', async (url) => {
    rl.close();

    if (!fs.existsSync('downloaded')) fs.mkdirSync('downloaded');
    if (!fs.existsSync('temp')) fs.mkdirSync('temp');


    let downloadedSomething = false;

    const videoUrl = url.trim();

    if (!ytdl.validateURL(videoUrl)) return console.log('Bad video URL');

    const title = (await ytdl.getBasicInfo(videoUrl)).videoDetails.title.replace(/[/\\?%*:|"<>]/g, '-');
    console.log(title);
    
    console.log('Downloading...')
    const audio = ytdl(videoUrl, { quality: 'highestaudio', filter: 'audioonly' }).pipe(fs.createWriteStream('temp/audio.mp3'));
    const video = ytdl(videoUrl, { quality: 'highestvideo', filter: format => format.container === 'mp4' }).pipe(fs.createWriteStream('temp/video.mp4'));

    audio.once('finish', () => {
        console.log('Downloaded audio.');
        if (downloadedSomething) connectAudioVideo(title);
        else console.log('Waiting for video to download...');
        downloadedSomething = true;
    });
    video.once('finish', () => {
        console.log('Downloaded video.');
        if (downloadedSomething) connectAudioVideo(title);
        else console.log('Waiting for audio to download...');
        downloadedSomething = true;
    });
});