// One-off: converts the original book/home PNGs to WebP with ASCII names.
// Run from the repo root: node web/scripts/optimize.mjs (needs `npm ci` in server/ for sharp).
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs/promises';

const require = createRequire(new URL('../../server/package.json', import.meta.url));
const sharp = require('sharp');

const root = new URL('../../', import.meta.url).pathname;
const books = path.join(root, 'เว็บขายหนังสือ', 'assets');
const home = path.join(root, 'home');

const jobs = [
  ...Object.entries({
    'Book1.png': 'book1', 'Book2.png': 'book2', 'Book3.png': 'book3', 'Book4.png': 'book4',
    'Book5.png': 'book5', 'Book6.png': 'book6', 'Book7.png': 'book7', 'Book8.png': 'book8',
    'Workshop1.png': 'workshop1', 'Workshop2.png': 'workshop2', 'Workshop3.png': 'workshop3',
    'chat1.png': 'chat1', 'chat2.png': 'chat2', 'chat3.png': 'chat3',
    'logo.png': 'logo', 'qrcode.png': 'qrcode', 'ttb.png': 'ttb',
    'สารบัญ1.png': 'toc1', 'สารบัญ2.png': 'toc2',
  }).map(([from, to]) => [path.join(books, from), path.join(root, 'web/books/assets', `${to}.webp`)]),
  [path.join(home, 'logo.png'), path.join(root, 'web/home/assets/logo.webp')],
  [path.join(home, 'qrcode.png'), path.join(root, 'web/home/assets/qrcode.webp')],
];

// product cards on the hub page: smaller than the page images
const cards = [
  [path.join(root, 'site/public/pic1.webp'), path.join(root, 'web/home/assets/kcut.webp'), 800],
  [path.join(root, 'web/books/assets/book1.webp'), path.join(root, 'web/home/assets/book.webp'), 700],
];

for (const [src, dest] of jobs) {
  const img = sharp(src);
  const { width } = await img.metadata();
  const out = await img.resize({ width: Math.min(width, 1200), withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
  await fs.writeFile(dest, out.data);
  console.log(path.basename(dest).padEnd(16), `${out.info.width}x${out.info.height}`, `${Math.round(out.data.length / 1024)} KB`);
}

for (const [src, dest, width] of cards) {   // runs after the loop above, which writes book1.webp
  const data = await sharp(src).resize({ width }).webp({ quality: 80 }).toBuffer();
  await fs.writeFile(dest, data);
  console.log(path.basename(dest).padEnd(16), `${width}px`, `${Math.round(data.length / 1024)} KB`);
}
