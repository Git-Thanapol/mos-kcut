// MOCK portfolio covers (3:4). Replace public/cover1..6.webp with real covers (or upload them in Sanity).
import sharp from 'sharp';
const hues = ['#1e3a8a', '#7c2d12', '#134e4a', '#581c87', '#7f1d1d', '#1e293b'];
for (let i = 1; i <= 6; i++) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${hues[i - 1]}"/><stop offset="1" stop-color="#0f172a"/></linearGradient></defs><rect width="600" height="800" fill="url(#g)"/><text x="300" y="400" font-family="sans-serif" font-size="64" font-weight="700" fill="#fbbf24" text-anchor="middle">COVER ${i}</text><text x="300" y="460" font-family="sans-serif" font-size="28" fill="#94a3b8" text-anchor="middle">placeholder</text></svg>`;
  await sharp(Buffer.from(svg)).webp({ quality: 80 }).toFile(`public/cover${i}.webp`);
}
console.log('6 placeholder covers written');
