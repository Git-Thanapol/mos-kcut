// Run: npm test   (temp folders, stubbed builder and media processors)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'kcut-cms-'));
process.env.DATA_DIR = path.join(DIR, 'orders');
delete process.env.SMTP_PASS;

const { defaults } = await import('../../site/src/data/defaults.ts');
const { createStore } = await import('../lib/store.js');
const { createMailer } = await import('../lib/mailer.js');
const { createApp } = await import('../lib/app.js');
const { createContentAdmin } = await import('../lib/content-admin.js');

const SITE = path.join(DIR, 'site');
const H = { Authorization: 'Basic ' + Buffer.from('admin:secret').toString('base64'), 'X-Requested-With': 'kcut-admin' };
let server, origin, store, builds = 0;
const builder = { trigger: () => { builds++; return Promise.resolve(); }, status: () => ({ state: 'idle', message: '', finishedAt: null }) };
const processors = { image: async (i, o) => fs.copyFileSync(i, o), video: async (i, o) => fs.copyFileSync(i, o) };
const put = (body) => fetch(origin + '/api/admin/content', { method: 'PUT', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const upload = (kind, buf) => fetch(`${origin}/api/admin/upload?kind=${kind}`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/octet-stream' }, body: buf });
const listing = (d) => (fs.existsSync(d) ? fs.readdirSync(d) : []);
const tinyPng = () => sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } }).png().toBuffer();

before(async () => {
  store = createStore(path.join(DIR, 'orders'));
  const contentAdmin = createContentAdmin({ siteDir: SITE, defaults, builder, processors });
  server = createApp({ store, mailer: createMailer(), adminPassword: 'secret', rateLimit: 1000, contentAdmin });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); store.close(); fs.rmSync(DIR, { recursive: true, force: true }); });

test('content admin routes need the admin password', async () => {
  for (const [method, p] of [['GET', '/admin/content'], ['GET', '/admin/content.js'], ['GET', '/api/admin/content'], ['PUT', '/api/admin/content'], ['POST', '/api/admin/upload?kind=image'], ['GET', '/api/admin/build']]) {
    assert.equal((await fetch(origin + p, { method })).status, 401, `${method} ${p}`);
  }
});

test('the admin page is served behind auth', async () => {
  const r = await fetch(origin + '/admin/content', { headers: H });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/html/);
  assert.equal((await fetch(origin + '/admin/content.js', { headers: H })).status, 200);
});

test('mutating requests without the CSRF header are refused', async () => {
  const noCsrf = { Authorization: H.Authorization };
  assert.equal((await fetch(origin + '/api/admin/content', { method: 'PUT', headers: { ...noCsrf, 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
  assert.equal((await fetch(origin + '/api/admin/upload?kind=image', { method: 'POST', headers: noCsrf, body: 'x' })).status, 403);
});

test('GET content gives defaults without a file; a corrupt file also falls back', async () => {
  let j = await (await fetch(origin + '/api/admin/content', { headers: H })).json();
  assert.deepEqual(j.content, defaults);
  fs.mkdirSync(path.join(SITE, 'data'), { recursive: true });
  fs.writeFileSync(path.join(SITE, 'data', 'content.json'), '{broken');
  j = await (await fetch(origin + '/api/admin/content', { headers: H })).json();
  assert.deepEqual(j.content, defaults);
  assert.deepEqual(j.defaults, defaults);
  fs.rmSync(path.join(SITE, 'data', 'content.json'));
});

test('PUT content: valid saves atomically, triggers a build, Thai text and newlines round-trip', async () => {
  const before = builds;
  const c = structuredClone(defaults); c.reviews[0].headline = 'สวัสดี\nชาวโลก 🎬';
  const r = await put(c);
  assert.equal(r.status, 202);
  assert.equal(builds, before + 1);
  assert.equal(JSON.parse(fs.readFileSync(path.join(SITE, 'data', 'content.json'), 'utf8')).reviews[0].headline, 'สวัสดี\nชาวโลก 🎬');
  assert.equal(fs.existsSync(path.join(SITE, 'data', 'content.json.tmp')), false);
  assert.equal((await (await fetch(origin + '/api/admin/content', { headers: H })).json()).content.reviews[0].headline, 'สวัสดี\nชาวโลก 🎬');
});

test('PUT content: invalid payloads give 400 with field errors and trigger no build', async () => {
  const before = builds;
  const traversal = structuredClone(defaults); traversal.hero.image = '/media/../../etc/passwd.png';
  const missing = structuredClone(defaults); missing.hero.image = '/media/does-not-exist.webp';
  const short = structuredClone(defaults); short.clips.pop();
  for (const payload of [traversal, missing, short]) {
    const r = await put(payload);
    assert.equal(r.status, 400);
    assert.ok(Array.isArray((await r.json()).errors));
  }
  const bad = await fetch(origin + '/api/admin/content', { method: 'PUT', headers: { ...H, 'Content-Type': 'application/json' }, body: '{not json' });
  assert.equal(bad.status, 400);
  assert.equal(builds, before);
});

test('upload image: stored under /media, original kept, then usable in a save', async () => {
  const r = await upload('image', await tinyPng());
  assert.equal(r.status, 200);
  const p = (await r.json()).path;
  assert.match(p, /^\/media\/[0-9a-f-]{36}\.webp$/);
  assert.ok(fs.existsSync(path.join(SITE, 'public', 'media', path.basename(p))));
  assert.equal(listing(path.join(SITE, 'data', 'uploads')).filter((f) => f.endsWith('.orig')).length, 1);
  const c = structuredClone(defaults); c.hero.image = p;
  assert.equal((await put(c)).status, 202);
});

test('upload: bytes that do not match ?kind= are rejected and leave nothing behind', async () => {
  const media = path.join(SITE, 'public', 'media'), uploads = path.join(SITE, 'data', 'uploads');
  const mediaBefore = listing(media).length, origBefore = listing(uploads).length;
  const png = await tinyPng();
  assert.equal((await upload('video', png)).status, 400);
  assert.equal((await upload('image', Buffer.from('plain text file, not an image at all'))).status, 400);
  assert.equal((await upload('banana', png)).status, 400);
  assert.equal(listing(media).length, mediaBefore);
  assert.equal(listing(uploads).length, origBefore);
});

test('processor failure gives 500 and cleans up', async () => {
  const bad = createContentAdmin({ siteDir: SITE, defaults, builder, processors: { image: async () => { throw new Error('boom'); }, video: processors.video } });
  const s = createApp({ store, mailer: createMailer(), adminPassword: 'secret', contentAdmin: bad });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const mediaBefore = listing(path.join(SITE, 'public', 'media')).length;
  const r = await fetch(`http://127.0.0.1:${s.address().port}/api/admin/upload?kind=image`, { method: 'POST', headers: H, body: await tinyPng() });
  assert.equal(r.status, 500);
  assert.equal(listing(path.join(SITE, 'public', 'media')).length, mediaBefore);
  s.close();
});

test('build status is exposed', async () => {
  assert.equal((await (await fetch(origin + '/api/admin/build', { headers: H })).json()).state, 'idle');
});

test('6th wrong admin password gets 429, even with the right password afterwards', async () => {
  const s = createApp({ store, mailer: createMailer(), adminPassword: 'secret', contentAdmin: null });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const o = `http://127.0.0.1:${s.address().port}`;
  const wrong = { Authorization: 'Basic ' + Buffer.from('admin:nope').toString('base64') };
  for (let i = 0; i < 5; i++) assert.equal((await fetch(o + '/admin', { headers: wrong })).status, 401);
  assert.equal((await fetch(o + '/admin', { headers: wrong })).status, 429);
  assert.equal((await fetch(o + '/admin', { headers: H })).status, 429);
  s.close();
});

test('preview route serves an uploaded file behind auth, only by bare file name', async () => {
  const p = (await (await upload('image', await tinyPng())).json()).path;
  const name = path.basename(p);
  assert.equal((await fetch(`${origin}/admin/preview/${name}`)).status, 401);
  const r = await fetch(`${origin}/admin/preview/${name}`, { headers: H });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /image\/webp/);
  for (const bad of ['..%2F..%2Fpackage.json', 'a%2Fb.webp', 'nope.webp', '.hidden']) {
    assert.equal((await fetch(`${origin}/admin/preview/${bad}`, { headers: H })).status, 404, bad);
  }
});

test('order review endpoints also require the CSRF header', async () => {
  const noCsrf = { Authorization: H.Authorization, 'Content-Type': 'application/json' };
  const r = await fetch(origin + '/api/admin/orders/KC-NOPE/paid', { method: 'POST', headers: noCsrf, body: '{}' });
  assert.equal(r.status, 403);
  const ok = await fetch(origin + '/api/admin/orders/KC-NOPE/paid', { method: 'POST', headers: { ...noCsrf, 'X-Requested-With': 'kcut-admin' }, body: '{}' });
  assert.equal(ok.status, 404);
});
