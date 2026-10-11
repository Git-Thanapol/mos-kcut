// Builds public/thai-address.json (bundled, no paid API) from the open dataset
// https://github.com/earthchie/jquery.Thailand.js (run: npm run address).
// Compact format: { p: [province], a: [[provinceIdx, amphoe]], d: [[subdistrict, amphoeIdx, zip]] }
import fs from 'node:fs';

const URL = 'https://raw.githubusercontent.com/earthchie/jquery.Thailand.js/master/jquery.Thailand.js/database/raw_database/raw_database.json';
const rows = await (await fetch(URL)).json();

const p = [], a = [], d = [];
const pIdx = new Map(), aIdx = new Map();
for (const r of rows.sort((x, y) => x.province_code - y.province_code || x.amphoe_code - y.amphoe_code || x.district_code - y.district_code)) {
  if (!pIdx.has(r.province)) { pIdx.set(r.province, p.length); p.push(r.province); }
  const ak = r.province + '|' + r.amphoe;
  if (!aIdx.has(ak)) { aIdx.set(ak, a.length); a.push([pIdx.get(r.province), r.amphoe]); }
  d.push([r.district, aIdx.get(ak), String(r.zipcode)]);
}
fs.writeFileSync('public/thai-address.json', JSON.stringify({ p, a, d }));
console.log(p.length, 'provinces,', a.length, 'districts,', d.length, 'sub-districts,',
  (fs.statSync('public/thai-address.json').size / 1024).toFixed(0) + ' KB');
