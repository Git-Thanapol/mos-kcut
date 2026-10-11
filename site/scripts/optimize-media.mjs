// Re-creates public/ media from the originals in ../KCUT_PROTOTYPE (run: npm run media).
// Images -> WebP (resized), videos -> H.264 720p with faststart.
import sharp from 'sharp';
import ffmpeg from 'ffmpeg-static';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const SRC = '../KCUT_PROTOTYPE/';
const OUT = 'public/';
const images = [
  // [source, output name, max width]
  ['Logo KCUT.png', 'logo-kcut', 192],
  ['pic1.png', 'pic1', 1280], ['pic2.png', 'pic2', 1280], ['pic3.png', 'pic3', 900], ['pic4.png', 'pic4', 900],
  ['ads01.png', 'ads01', 1280], ['ads04.png', 'ads04', 1280],
  ['นามบัตร ตลอดชีพ.png', 'card-lifetime', 800], ['นามบัตร รายเดือน.png', 'card-monthly', 600], ['นามบัตร รายปี.png', 'card-yearly', 600],
  ['chat1.jpg', 'chat1', 1000], ['chat2.jpg', 'chat2', 1000], ['chat3.jpg', 'chat3', 1000],
  ['chrome.png', 'chrome', 128], ['devices.jpg', 'devices', 320], ['qrcode.png', 'qrcode', 480], ['ttb.png', 'ttb', 160],
];
for (const [file, name, width] of images) {
  await sharp(SRC + file).resize({ width, withoutEnlargement: true }).webp({ quality: 82 }).toFile(`${OUT}${name}.webp`);
  console.log(name, (fs.statSync(`${OUT}${name}.webp`).size / 1024).toFixed(0) + ' KB');
}
const videos = [['video-demo.mp4', 'video-demo.mp4', 27], ['GIF.mp4', 'GIF.mp4', 30]];
for (const [file, name, crf] of videos) {
  execFileSync(ffmpeg, ['-y', '-i', SRC + file, '-vf', "scale='min(1280,iw)':-2", '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf),
    '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', OUT + name], { stdio: 'ignore' });
  console.log(name, (fs.statSync(OUT + name).size / 1048576).toFixed(1) + ' MB');
}
