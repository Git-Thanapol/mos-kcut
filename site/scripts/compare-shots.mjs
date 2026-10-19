// Visual regression helper: compares two full-page screenshots band by band.
// Run: node scripts/compare-shots.mjs proto.png site.png [registerTop]
// Everything above `registerTop` must line up row for row; the part after it is compared aligned from the bottom,
// because the checkout form is intentionally taller (extra e-mail field).
import sharp from 'sharp';

const [a, b, regTop] = [process.argv[2], process.argv[3], Number(process.argv[4] || 0)];
const load = async (f) => { const { data, info } = await sharp(f).removeAlpha().raw().toBuffer({ resolveWithObject: true }); return { data, w: info.width, h: info.height }; };
const A = await load(a), B = await load(b);
if (A.w !== B.w) throw new Error(`width differs ${A.w} vs ${B.w}`);
const BAND = 200, W = A.w;

function bandDiff(rowA, rowB, rows) {              // mean absolute channel difference (0-255) and % of pixels differing by > 24
  let sum = 0, bad = 0;
  for (let y = 0; y < rows; y++) for (let x = 0; x < W; x++) {
    const i = ((rowA + y) * W + x) * 3, j = ((rowB + y) * W + x) * 3;
    const d = (Math.abs(A.data[i] - B.data[j]) + Math.abs(A.data[i + 1] - B.data[j + 1]) + Math.abs(A.data[i + 2] - B.data[j + 2])) / 3;
    sum += d; if (d > 24) bad++;
  }
  return { mean: sum / (rows * W), bad: (100 * bad) / (rows * W) };
}
const report = (label, off, startA, startB, len) => {
  const worst = [];
  let tot = 0, n = 0;
  for (let y = 0; y < len; y += BAND) {
    const rows = Math.min(BAND, len - y), d = bandDiff(startA + y, startB + y, rows);
    tot += d.mean; n++; worst.push({ y: startA + y, ...d });
  }
  worst.sort((p, q) => q.bad - p.bad);
  console.log(`${label}: ${n} bands, mean diff ${(tot / n).toFixed(2)}/255; worst bands (y, % pixels off):`,
    worst.slice(0, 3).map((w) => `${w.y}: ${w.bad.toFixed(1)}%`).join(' | '));
};
console.log(`proto ${A.w}x${A.h}  site ${B.w}x${B.h}  (height delta ${B.h - A.h})`);
const top = regTop || Math.min(A.h, B.h);
report('top (above checkout)', 0, 0, 0, top);
if (regTop) {
  const tail = Math.min(A.h, B.h) - regTop - 2613;   // after the checkout section (prototype height at this width is approximate)
  const len = Math.max(0, Math.min(1500, Math.min(A.h, B.h) - regTop - 200));
  if (len > 0) report('bottom (aligned from end)', 0, A.h - len, B.h - len, len);
}
