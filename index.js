const ytdl = require('ytdl-core');
const fs = require('fs');
const { execSync } = require('child_process');

const readline = require("readline");
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function cleanup() {
    fs.rmSync('temp/output.mp4');
    fs.rmSync('temp/video.mp4');
    fs.rmSync('temp/audio.mp3');
}

function joinAudioVideo(title) {
    console.log('Joining audio + video');
    if (fs.existsSync('temp/output.mp4')) fs.rmSync('temp/output.mp4');

    execSync('ffmpeg -hide_banner -loglevel error -i temp/video.mp4 -i temp/audio.mp3 -c copy -shortest temp/output.mp4');
    fs.copyFileSync('temp/output.mp4', `downloaded/${title}.mp4`);

    cleanup().catch(err => console.log(`Failed to clean ${err}`));

    console.log(`Done. Saved as ${title}.mp4`);
}

rl.question('Youtube video URL: ', async (url) => {

    if (!fs.existsSync('downloaded')) fs.mkdirSync('downloaded');
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

    rl.question('Select video resolution: ', async (res) => {
        rl.close();

        const resolution = parseInt(res);

        if (!resolutions.includes(resolution)) return console.log('Bad video resolution');

        console.log('Downloading...');

        const audio = ytdl(videoUrl, { quality: 'highestaudio', filter: 'audioonly' }).pipe(fs.createWriteStream('temp/audio.mp3'));
        const video = ytdl(videoUrl, { quality: 'highestvideo', filter: format => format.container === 'mp4' && format.height === resolution }).pipe(fs.createWriteStream('temp/video.mp4'));
        
        let downloadedSomething = false;

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
    });
});