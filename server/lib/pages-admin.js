// Owner admin for the static pages: GET /api/admin/pages, PUT /api/admin/pages/<home|books>. Mounted by app.js behind
// the admin auth. Overrides live in site/data/pages.json; saving renders web/<page>/index.live.html right away (no build).
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { parseSlots, render, validateValues } from './pages.js';

export const PAGES = {
  home: {
    title: 'หน้ารวมสินค้า (spvdo.com)', dir: 'home', base: '/', url: '/',
    groups: { hero: 'ส่วนบนสุด (Hero)', products: 'การ์ดสินค้า', cta: 'กล่องแอดไลน์' },
  },
  books: {
    title: 'หน้าขายหนังสือ (/books)', dir: 'books', base: '/books/', url: '/books/',
    groups: {
      hero: 'ส่วนบนสุด (Hero)', stats: 'แถบตัวเลขสรุป', problem: 'หัวข้อ "เริ่มจากพื้นฐาน"', inside: 'สารบัญ',
      samples: 'ตัวอย่างในเล่ม (Workshop)', qr: 'สิทธิพิเศษ QR คลิปสอน', prompt: 'แพ็กหนังสือ + เว็บ Prompt',
      proof: 'ผู้เขียนและรีวิว', order: 'หัวข้อส่วนสั่งซื้อ', faq: 'คำถามที่พบบ่อย', line: 'ติดต่อ LINE',
    },
  },
};

export function createPagesAdmin({ siteDir, webDir, pages = PAGES, log = console }) {
  const dataDir = path.join(siteDir, 'data');
  const mediaDir = path.join(siteDir, 'public', 'media');
  const valuesFile = path.join(dataDir, 'pages.json');
  const templateFile = (name) => path.join(webDir, pages[name].dir, 'index.html');
  const liveFile = (name) => path.join(webDir, pages[name].dir, 'index.live.html');
  const mediaExists = (p) => fs.existsSync(path.join(mediaDir, path.basename(p)));

  function readAll() {
    try {
      const j = JSON.parse(fs.readFileSync(valuesFile, 'utf8'));
      return Object.fromEntries(Object.keys(pages).map((n) => [n, j?.[n] && typeof j[n] === 'object' && !Array.isArray(j[n]) ? j[n] : {}]));
    } catch { return Object.fromEntries(Object.keys(pages).map((n) => [n, {}])); }
  }

  // Writes (or removes) the live file. Called after every save and at start-up so a deployed template change shows up.
  async function publish(name, values) {
    const file = liveFile(name);
    if (!Object.keys(values).length) return fsp.rm(file, { force: true });
    const html = render(await fsp.readFile(templateFile(name), 'utf8'), values);
    await fsp.writeFile(`${file}.tmp`, html, 'utf8');
    await fsp.rename(`${file}.tmp`, file);
  }

  function describe(name, values) {
    const cfg = pages[name];
    const slots = parseSlots(fs.readFileSync(templateFile(name), 'utf8')).map((s) => {
      const group = s.key.split('.')[0];
      const def = s.kind === 'image' && !s.default.startsWith('/') ? cfg.base + s.default : s.default;
      return { key: s.key, kind: s.kind, label: s.label, default: def, group, groupTitle: cfg.groups[group] ?? group };
    });
    return { title: cfg.title, url: cfg.url, slots, values };
  }

  Promise.all(Object.entries(readAll()).map(([n, v]) => publish(n, v).catch((e) => log.error(`[pages] ${n}: ${e.message}`)))).catch(() => {});

  return async function handle(req, res, url, { send, readBody }) {
    const p = url.pathname;
    if (req.method === 'GET' && p === '/api/admin/pages') {
      const all = readAll();
      return send(res, 200, { pages: Object.fromEntries(Object.keys(pages).map((n) => [n, describe(n, all[n])])) }), true;
    }
    const m = /^\/api\/admin\/pages\/([a-z]+)$/.exec(p);
    if (!m || req.method !== 'PUT' || !pages[m[1]]) return false;
    if (req.headers['x-requested-with'] !== 'kcut-admin') return send(res, 403, { error: 'คำขอไม่ถูกต้อง' }), true;
    let body;
    try { body = JSON.parse(await readBody(req, 1024 * 1024)); } catch (e) {
      return send(res, e.code === 413 ? 413 : 400, { error: e.code === 413 ? 'ข้อมูลใหญ่เกินไป' : 'ข้อมูลไม่ถูกต้อง' }), true;
    }
    const name = m[1];
    const { errors, clean } = validateValues(body?.values, describe(name, {}).slots, mediaExists);
    if (errors.length) return send(res, 400, { error: 'ข้อมูลไม่ถูกต้อง', errors }), true;
    const all = readAll();
    all[name] = clean;
    await fsp.mkdir(dataDir, { recursive: true });
    await fsp.writeFile(`${valuesFile}.tmp`, JSON.stringify(all, null, 2), 'utf8');
    await fsp.rename(`${valuesFile}.tmp`, valuesFile);
    await publish(name, clean);
    return send(res, 200, { ok: true, values: clean }), true;
  };
}
