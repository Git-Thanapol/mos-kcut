import fsp from 'node:fs/promises';
import { spawn } from 'node:child_process';
import sharp from 'sharp';

export async function detectKind(file) {
  let fh;
  try {
    fh = await fsp.open(file, 'r');
    const b = Buffer.alloc(16);
    const { bytesRead } = await fh.read(b, 0, 16, 0);
    if (bytesRead < 12) return null;
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image';                       // jpeg
    if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image'; // png
    if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'image';
    if (b.toString('latin1', 4, 8) === 'ftyp') return 'video';                                  // mp4 / mov
    return null;
  } catch {
    return null;
  } finally {
    await fh?.close();
  }
}

export async function processImage(inFile, outFile) {
  await sharp(inFile).rotate().resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 82 }).toFile(outFile);
}

export function processVideo(inFile, outFile) {
  const bin = process.env.FFMPEG_PATH || 'ffmpeg';
  const args = ['-y', '-i', inFile, '-vf', "scale=-2:'min(720,ih)'", '-c:v', 'libx264', '-crf', '28', '-preset', 'veryfast',
    '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', outFile];
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err = (err + d).slice(-2000); });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${err}`))));
  });
}
