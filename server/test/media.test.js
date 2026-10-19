import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
import { createRequire } from 'node:module';
const ffmpegPath = createRequire(import.meta.url)('../../site/node_modules/ffmpeg-static');
import { detectKind, processImage, processVideo } from '../lib/media.js';

process.env.FFMPEG_PATH = process.env.FFMPEG_PATH || ffmpegPath;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kcut-media-'));
const f = (n) => path.join(tmp, n);

test('detectKind by magic bytes, not by name', async () => {
  await sharp({ create: { width: 8, height: 8, channels: 3, background: '#f00' } }).png().toFile(f('a.png'));
  fs.writeFileSync(f('fake.mp4'), 'hello, I am text');
  assert.equal(await detectKind(f('a.png')), 'image');
  assert.equal(await detectKind(f('fake.mp4')), null);
  assert.equal(await detectKind(f('missing')), null);
});

test('processImage outputs webp and downsizes', async () => {
  await sharp({ create: { width: 3000, height: 1000, channels: 3, background: '#0a0' } }).jpeg().toFile(f('big.jpg'));
  await processImage(f('big.jpg'), f('big.webp'));
  const meta = await sharp(f('big.webp')).metadata();
  assert.equal(meta.format, 'webp');
  assert.equal(meta.width, 1600);
  assert.equal(await detectKind(f('big.webp')), 'image');
});

test('processVideo outputs mp4 at most 720p high', async () => {
  const r = spawnSync(process.env.FFMPEG_PATH, ['-y', '-f', 'lavfi', '-i', 'testsrc=duration=1:size=1280x1080:rate=10',
    '-f', 'lavfi', '-i', 'sine=duration=1', '-shortest', '-pix_fmt', 'yuv420p', f('in.mp4')]);
  assert.equal(r.status, 0, String(r.stderr));
  assert.equal(await detectKind(f('in.mp4')), 'video');
  await processVideo(f('in.mp4'), f('out.mp4'));
  assert.equal(await detectKind(f('out.mp4')), 'video');
  assert.ok(fs.statSync(f('out.mp4')).size > 0);
});

test('processVideo rejects on corrupt input', async () => {
  fs.writeFileSync(f('bad.mp4'), 'not a video');
  await assert.rejects(processVideo(f('bad.mp4'), f('bad-out.mp4')));
});
