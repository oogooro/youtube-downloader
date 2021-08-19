const ytdl = require('ytdl-core');
const fs = require('fs');
const { execSync } = require('child_process');

const readline = require("readline");
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function cleanupAudio() {
    fs.rmSync('temp/output.mp3');
    fs.rmSync('temp/audio');
}

async function cleanupVideo() {
    fs.rmSync('temp/output.mp4');
    fs.rmSync('temp/video');
    fs.rmSync('temp/audio');
}

function joinAudioVideo(title) {
    console.log('Joining audio + video');
    if (fs.existsSync('temp/output.mp4')) fs.rmSync('temp/output.mp4');

    execSync('ffmpeg -hide_banner -loglevel error -i temp/video -i temp/audio -c copy -shortest temp/output.mp4');
    fs.copyFileSync('temp/output.mp4', `downloaded/${title}.mp4`);

    cleanupVideo().catch(err => console.log(`Failed to clean ${err}`));

    console.log(`Done. Saved as ${title}.mp4`);
}

rl.question('Youtube video URL: ', async (url) => {

    if (!fs.existsSync('downloaded')) fs.mkdirSync('downloaded');
    if (!fs.existsSync('downloaded/audio')) fs.mkdirSync('downloaded/audio');
    if (!fs.existsSync('temp')) fs.mkdirSync('temp');

    const videoUrl = url.trim();
    
    if (!ytdl.validateURL(videoUrl)) {rl.close(); return console.log('Bad video URL');}

    const videoInfo = await ytdl.getInfo(videoUrl);

    const title = videoInfo.videoDetails.title.replace(/[/\\?%*:|"<>]/g, '-');
    
    let resolutions = [];
    
    videoInfo.formats.forEach(format => {
        if (format.height && !resolutions.includes(format.height) && format.container === 'mp4') resolutions.push(format.height);
    });

    resolutions.sort((a, b) => b - a);
    
    console.log(`Avalivable resolutions: ${resolutions.toString().split(',').join(', ')}`);
    console.log(`Options: audio`);

    rl.question('Select video resolution or option: ', async (res) => {
        rl.close();

        let audioOnly = false;
        let downloadedSomething = false;

        if (res === 'audio') {
            audioOnly = true;
            console.log('Downloading...');

            const audio = ytdl(videoUrl, { quality: 'highestaudio', filter: 'audioonly' }).pipe(fs.createWriteStream('temp/audio'));

            audio.once('finish', () => {
                console.log('Finished download, encoding...');
                execSync('ffmpeg -hide_banner -loglevel error -i temp/audio -b:a 192K -vn temp/output.mp3');
                fs.copyFileSync('temp/output.mp3', `downloaded/audio/${title}.mp3`);
                cleanupAudio().catch(err => console.log(`Failed to clean ${err}`));
                console.log(`Done. Saved as ${title}.mp3`);
            });
        }
        else {
            const resolution = parseInt(res);

            if (!resolutions.includes(resolution)) return console.log('Bad video resolution or option');

            console.log('Starting download...');

            const audio = ytdl(videoUrl, { quality: 'highestaudio', filter: 'audioonly' }).pipe(fs.createWriteStream('temp/audio'));
            const video = ytdl(videoUrl, { quality: 'highestvideo', filter: format => format.container === 'mp4' && format.height === resolution }).pipe(fs.createWriteStream('temp/video'));

            audio.once('finish', () => {
                console.log('Downloaded audio.');
                if (downloadedSomething) joinAudioVideo(title);
                else console.log('Waiting for video to download... \nIf video fail to download try with other resolutions');
                downloadedSomething = true;
            });
    
            video.once('finish', () => {
                console.log('Downloaded video.');
                if (downloadedSomething) joinAudioVideo(title);
                else console.log('Waiting for audio to download...');
                downloadedSomething = true;
            });
        }
    });
});