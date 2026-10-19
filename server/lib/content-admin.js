// Owner content admin: /admin/content (page), /api/admin/content|upload|build. Mounted by app.js behind the admin auth.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { validateContent, collectPaths } from './schema.js';
import { detectKind, processImage, processVideo } from './media.js';

const LIMITS = { image: 15 * 1024 * 1024, video: 300 * 1024 * 1024 };
const UI_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'admin');
const PAGES = { '/admin/content': ['content.html', 'text/html; charset=utf-8'], '/admin/content.js': ['content.js', 'text/javascript; charset=utf-8'] };

export function createContentAdmin({ siteDir, defaults, builder, processors = { image: processImage, video: processVideo } }) {
  const dataDir = path.join(siteDir, 'data');
  const mediaDir = path.join(siteDir, 'public', 'media');
  const uploadsDir = path.join(dataDir, 'uploads');
  const contentFile = path.join(dataDir, 'content.json');
  const known = collectPaths(defaults);

  async function readContent() {
    try {
      const parsed = JSON.parse(await fsp.readFile(contentFile, 'utf8'));
      if (validateContent(parsed, known).ok) return parsed;
    } catch { /* missing or corrupt -> defaults */ }
    return defaults;
  }

  // Returns true when the request was handled.
  return async function handle(req, res, url, { send, readBody }) {
    const p = url.pathname;
    const page = req.method === 'GET' && PAGES[p];
    if (page) return send(res, 200, await fsp.readFile(path.join(UI_DIR, page[0]), 'utf8'), page[1]), true;
    if (req.method === 'GET' && p.startsWith('/admin/preview/')) {   // uploads are only in public/media until the next publish
      const name = p.slice('/admin/preview/'.length);
      const m = /^[0-9a-f-]{36}.(webp|mp4)$/.exec(name);
      const file = m && path.join(mediaDir, name);
      if (!file || !fs.existsSync(file)) return send(res, 404, 'ไม่พบไฟล์', 'text/plain; charset=utf-8'), true;
      return send(res, 200, await fsp.readFile(file), m[1] === 'webp' ? 'image/webp' : 'video/mp4'), true;
    }
    if (!p.startsWith('/api/admin/') || !['content', 'upload', 'build'].includes(p.slice('/api/admin/'.length))) return false;

    if (req.method !== 'GET' && req.headers['x-requested-with'] !== 'kcut-admin') {
      return send(res, 403, { error: 'คำขอไม่ถูกต้อง' }), true;
    }

    if (req.method === 'GET' && p === '/api/admin/content') return send(res, 200, { content: await readContent(), defaults }), true;
    if (req.method === 'GET' && p === '/api/admin/build') return send(res, 200, builder.status()), true;

    if (req.method === 'PUT' && p === '/api/admin/content') {
      let body;
      try { body = JSON.parse(await readBody(req, 1024 * 1024)); } catch (e) {
        return send(res, e.code === 413 ? 413 : 400, { error: e.code === 413 ? 'ข้อมูลใหญ่เกินไป' : 'ข้อมูลไม่ถูกต้อง' }), true;
      }
      const errors = [...validateContent(body, known).errors];
      if (!errors.length) {
        for (const f of collectPaths(body)) {
          if (f.startsWith('/media/') && !fs.existsSync(path.join(mediaDir, path.basename(f)))) errors.push({ field: f, message: 'ไม่พบไฟล์ที่อัปโหลด' });
        }
      }
      if (errors.length) return send(res, 400, { error: 'ข้อมูลไม่ถูกต้อง', errors }), true;
      await fsp.mkdir(dataDir, { recursive: true });
      const tmp = `${contentFile}.tmp`;
      await fsp.writeFile(tmp, JSON.stringify(body, null, 2), 'utf8');
      await fsp.rename(tmp, contentFile);
      builder.trigger();
      return send(res, 202, { ok: true }), true;
    }

    if (req.method === 'POST' && p === '/api/admin/upload') {
      const kind = url.searchParams.get('kind');
      if (kind !== 'image' && kind !== 'video') return send(res, 400, { error: 'ชนิดไฟล์ไม่ถูกต้อง' }), true;
      await fsp.mkdir(uploadsDir, { recursive: true });
      await fsp.mkdir(mediaDir, { recursive: true });
      const id = randomUUID();
      const ext = kind === 'image' ? 'webp' : 'mp4';
      const tmp = path.join(uploadsDir, `${id}.upload`);
      const out = path.join(mediaDir, `${id}.${ext}`);
      const fail = async (code, error) => { await fsp.rm(tmp, { force: true }); await fsp.rm(out, { force: true }); send(res, code, { error }); return true; };
      const cap = LIMITS[kind];
      let size = 0;
      const counter = new Transform({
        transform(chunk, _enc, cb) {          // over the cap we keep draining (so the client gets our 413) but write nothing
          size += chunk.length;
          if (size > cap * 4) return cb(new Error('too large'));
          cb(null, size > cap ? null : chunk);
        },
      });
      try {
        await pipeline(req, counter, fs.createWriteStream(tmp));
        if (size > cap) return await fail(413, kind === 'image' ? 'รูปใหญ่เกิน 15 MB' : 'วิดีโอใหญ่เกิน 300 MB');
        if ((await detectKind(tmp)) !== kind) return await fail(400, kind === 'image' ? 'ไฟล์ไม่ใช่รูป (รองรับ JPG, PNG, WebP)' : 'ไฟล์ไม่ใช่วิดีโอ (รองรับ MP4, MOV)');
        await processors[kind](tmp, out);
        await fsp.rename(tmp, path.join(uploadsDir, `${id}.orig`));
        return send(res, 200, { path: `/media/${id}.${ext}` }), true;
      } catch {
        return await fail(500, 'ประมวลผลไฟล์ไม่สำเร็จ กรุณาลองใหม่หรือใช้ไฟล์อื่น');
      }
    }
    return false;
  };
}
