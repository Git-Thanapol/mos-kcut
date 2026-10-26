// Editable "slots" in the static pages (web/home, web/books).
// The template is the page itself: text is wrapped in <!--t:key-->default<!--/t-->, images carry data-img="key".
// Overrides (key -> value) are rendered into index.live.html next to the template; nginx prefers that file.
const TEXT_RE = /<!--t:([a-z0-9]+(?:\.[a-z0-9]+)+)-->([\s\S]*?)<!--\/t-->/g;
const IMG_RE = /<img\b[^>]*?\bdata-img="([a-z0-9]+(?:\.[a-z0-9]+)+)"[^>]*>/g;
export const MAX_TEXT = 1000;
export const MEDIA_RE = /^\/media\/[0-9a-f-]{36}\.webp$/;

const decode = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Editors see plain text: a new line is <br>, *highlighted words* are the <span> used in the headings.
export function htmlToEdit(inner) {
  const text = inner.replace(/<br\s*\/?>/g, '\n').replace(/<span>([^<]*)<\/span>/g, '*$1*');
  if (text.includes('<')) throw new Error(`unsupported markup in slot: ${inner}`);
  return decode(text);
}
export function editToHtml(text) {
  return escape(text).replace(/\r?\n/g, '<br>').replace(/\*([^*\n]+)\*/g, '<span>$1</span>');
}

export function parseSlots(html) {
  const slots = [];
  for (const m of html.matchAll(TEXT_RE)) {
    const def = htmlToEdit(m[2]);
    slots.push({ at: m.index, key: m[1], kind: 'text', default: def, label: def.replace(/\s+/g, ' ').slice(0, 50) });
  }
  for (const m of html.matchAll(IMG_RE)) {
    const src = /\ssrc="([^"]*)"/.exec(m[0])?.[1] ?? '';
    const alt = /\salt="([^"]*)"/.exec(m[0])?.[1] ?? '';
    slots.push({ at: m.index, key: m[1], kind: 'image', default: src, label: decode(alt) || 'รูปภาพ' });
  }
  slots.sort((a, b) => a.at - b.at);
  const seen = new Set();
  for (const s of slots) { if (seen.has(s.key)) throw new Error(`duplicate slot key ${s.key}`); seen.add(s.key); delete s.at; }
  return slots;
}

export function render(html, values = {}) {
  return html
    .replace(TEXT_RE, (_all, key, inner) => (typeof values[key] === 'string' ? editToHtml(values[key]) : inner))
    .replace(IMG_RE, (tag, key) => (typeof values[key] === 'string'
      ? tag.replace(/\ssrc="[^"]*"/, ` src="${values[key]}"`).replace(/\s(?:width|height)="[^"]*"/g, '')   // new image, new aspect ratio
      : tag));
}

// values: { key: string }. `mediaExists(path)` checks an uploaded file. Returns { errors, clean } where clean drops
// values equal to the default so only real changes are stored.
export function validateValues(values, slots, mediaExists) {
  const errors = [];
  const bad = (field, message) => errors.push({ field, message });
  const clean = {};
  if (values === null || typeof values !== 'object' || Array.isArray(values)) return { errors: [{ field: '', message: 'ข้อมูลไม่ถูกต้อง' }], clean };
  const byKey = new Map(slots.map((s) => [s.key, s]));
  for (const [key, v] of Object.entries(values)) {
    const slot = byKey.get(key);
    if (!slot) { bad(key, 'ไม่พบรายการนี้ในหน้า'); continue; }
    if (typeof v !== 'string') { bad(key, 'ข้อมูลไม่ถูกต้อง'); continue; }
    if (slot.kind === 'text') {
      if ([...v.trim()].length < 1 || [...v].length > MAX_TEXT) { bad(key, `ต้องไม่ว่างและไม่เกิน ${MAX_TEXT} ตัวอักษร`); continue; }
      if (v !== slot.default) clean[key] = v;
    } else if (v !== slot.default) {
      if (!MEDIA_RE.test(v)) { bad(key, 'ไฟล์รูปไม่ถูกต้อง'); continue; }
      if (!mediaExists(v)) { bad(key, 'ไม่พบไฟล์ที่อัปโหลด'); continue; }
      clean[key] = v;
    }
  }
  return { errors, clean };
}
