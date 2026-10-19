export const COUNTS = { features: 10, clips: 6, reviews: 3 };

const PATH_RE = /^\/[A-Za-z0-9_-][A-Za-z0-9_./-]*\.(webp|jpg|jpeg|png|mp4)$/;
const len = (s) => [...s].length;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function collectPaths(c) {
  const out = new Set();
  const add = (v) => { if (typeof v === 'string') out.add(v); };
  if (isObj(c?.hero)) { add(c.hero.image); add(c.hero.video); add(c.hero.poster); }
  for (const f of c?.features ?? []) add(f?.video);
  for (const k of c?.clips ?? []) add(k?.cover);
  for (const r of c?.reviews ?? []) add(r?.image);
  return out;
}

export function validateContent(c, known) {
  const errors = [];
  const bad = (field, message) => errors.push({ field, message });
  const text = (field, v, max) => {
    if (typeof v !== 'string' || len(v.trim()) < 1 || len(v) > max) bad(field, `ต้องไม่ว่างและไม่เกิน ${max} ตัวอักษร`);
  };
  const media = (field, v) => {
    const ok = typeof v === 'string' && PATH_RE.test(v) && !v.includes('..') && (v.startsWith('/media/') || known.has(v));
    if (!ok) bad(field, 'ไฟล์สื่อไม่ถูกต้อง');
  };

  if (!isObj(c)) return { ok: false, errors: [{ field: '', message: 'ข้อมูลไม่ถูกต้อง' }] };

  if (!isObj(c.hero)) bad('hero', 'ข้อมูลไม่ถูกต้อง');
  else { media('hero.image', c.hero.image); media('hero.video', c.hero.video); media('hero.poster', c.hero.poster); }

  for (const [key, n] of Object.entries(COUNTS)) {
    if (!Array.isArray(c[key]) || c[key].length !== n) bad(key, `จำนวนรายการต้องเป็น ${n}`);
  }
  if (errors.length) return { ok: false, errors };

  c.features.forEach((f, i) => {
    if (!isObj(f)) return bad(`features[${i}]`, 'ข้อมูลไม่ถูกต้อง');
    text(`features[${i}].title`, f.title, 120); text(`features[${i}].desc`, f.desc, 400); media(`features[${i}].video`, f.video);
  });
  c.clips.forEach((k, i) => {
    if (!isObj(k)) return bad(`clips[${i}]`, 'ข้อมูลไม่ถูกต้อง');
    text(`clips[${i}].views`, k.views, 20); text(`clips[${i}].title`, k.title, 120);
    text(`clips[${i}].subtitle`, k.subtitle, 120); media(`clips[${i}].cover`, k.cover);
  });
  c.reviews.forEach((r, i) => {
    if (!isObj(r)) return bad(`reviews[${i}]`, 'ข้อมูลไม่ถูกต้อง');
    if (!Number.isInteger(r.rating) || r.rating < 1 || r.rating > 5) bad(`reviews[${i}].rating`, 'คะแนนต้องเป็นเลข 1-5');
    text(`reviews[${i}].headline`, r.headline, 200); text(`reviews[${i}].name`, r.name, 120);
    text(`reviews[${i}].body`, r.body, 600); media(`reviews[${i}].image`, r.image);
  });
  return { ok: errors.length === 0, errors };
}
