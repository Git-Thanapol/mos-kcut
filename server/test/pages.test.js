// Run: npm test   (temp folders; the real templates in web/ are only read)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'kcut-pages-'));
process.env.DATA_DIR = path.join(DIR, 'orders');
delete process.env.SMTP_PASS;

const { createStore } = await import('../lib/store.js');
const { createMailer } = await import('../lib/mailer.js');
const { createApp } = await import('../lib/app.js');
const { createPagesAdmin } = await import('../lib/pages-admin.js');
const { parseSlots, render, editToHtml, htmlToEdit } = await import('../lib/pages.js');

const REAL_WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'web');
const SITE = path.join(DIR, 'site');
const WEB = path.join(DIR, 'web');
const H = { Authorization: 'Basic ' + Buffer.from('admin:secret').toString('base64'), 'X-Requested-With': 'kcut-admin' };
const UUID = '0a1b2c3d-0000-4000-8000-0123456789ab';
let server, origin, store;
const put = (name, values, headers = H) => fetch(`${origin}/api/admin/pages/${name}`, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ values }) });
const get = async () => (await fetch(origin + '/api/admin/pages', { headers: H })).json();
const live = (name) => path.join(WEB, name, 'index.live.html');

before(async () => {
  for (const name of ['home', 'books']) {
    fs.mkdirSync(path.join(WEB, name), { recursive: true });
    fs.copyFileSync(path.join(REAL_WEB, name, 'index.html'), path.join(WEB, name, 'index.html'));
  }
  fs.mkdirSync(path.join(SITE, 'public', 'media'), { recursive: true });
  fs.writeFileSync(path.join(SITE, 'public', 'media', `${UUID}.webp`), 'x');
  store = createStore(path.join(DIR, 'orders'));
  server = createApp({ store, mailer: createMailer(), adminPassword: 'secret', rateLimit: 1000, pagesAdmin: createPagesAdmin({ siteDir: SITE, webDir: WEB }) });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); store.close(); fs.rmSync(DIR, { recursive: true, force: true }); });

test('every slot of the real templates parses, keys are unique and rendering without overrides keeps the page', () => {
  for (const name of ['home', 'books']) {
    const html = fs.readFileSync(path.join(REAL_WEB, name, 'index.html'), 'utf8');
    const slots = parseSlots(html);                     // throws on unsupported markup or duplicate keys
    assert.ok(slots.filter((s) => s.kind === 'text').length > 10 && slots.some((s) => s.kind === 'image'), name);
    for (const s of slots.filter((x) => x.kind === 'text')) assert.equal(htmlToEdit(editToHtml(s.default)), s.default, `${name} ${s.key} round-trips`);
    assert.ok(!render(html).includes('<!--t:') && !render(html).includes('<!--/t-->'), 'markers are removed');
  }
});

test('prices are never editable slots', () => {
  for (const name of ['home', 'books']) {
    for (const s of parseSlots(fs.readFileSync(path.join(REAL_WEB, name, 'index.html'), 'utf8'))) {
      if (s.kind === 'text') assert.ok(!/บาท/.test(s.default) && !/^\d[\d,]*$/.test(s.default), `${name} ${s.key}: ${s.default}`);
    }
  }
});

test('render: text is escaped, new lines and *highlights* become markup, images swap src and drop the size', () => {
  const tpl = '<h1><!--t:a.b-->x<br><span>y</span><!--/t--></h1><img data-img="a.i" src="assets/o.webp" width="9" height="9" alt="o">';
  assert.equal(render(tpl, { 'a.b': 'บรรทัด 1\nบรรทัด *2* <script>alert(1)</script> & "q"' }),
    '<h1>บรรทัด 1<br>บรรทัด <span>2</span> &lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;q&quot;</h1><img data-img="a.i" src="assets/o.webp" width="9" height="9" alt="o">');
  assert.equal(render(tpl, { 'a.i': `/media/${UUID}.webp` }), `<h1>x<br><span>y</span></h1><img data-img="a.i" src="/media/${UUID}.webp" alt="o">`);
});

test('pages routes need the password and the CSRF header', async () => {
  assert.equal((await fetch(origin + '/api/admin/pages')).status, 401);
  assert.equal((await fetch(origin + '/api/admin/pages/home', { method: 'PUT', body: '{}' })).status, 401);
  assert.equal((await put('home', {}, { Authorization: H.Authorization })).status, 403);
});

test('GET lists slots with groups and absolute image defaults', async () => {
  const { pages } = await get();
  assert.deepEqual(Object.keys(pages), ['home', 'books']);
  const img = pages.books.slots.find((s) => s.kind === 'image');
  assert.match(img.default, /^\/books\/assets\/.+\.webp$/);
  assert.match(pages.home.slots.find((s) => s.kind === 'image').default, /^\/assets\/.+\.webp$/);
  assert.ok(pages.books.slots.every((s) => s.groupTitle && s.label));
  assert.deepEqual(pages.books.values, {});
});

test('PUT saves only real changes, renders the live file at once, and an empty save removes it', async () => {
  const { pages } = await get();
  const t = pages.books.slots.find((s) => s.kind === 'text');
  const i = pages.books.slots.find((s) => s.kind === 'image');
  const other = pages.books.slots.filter((s) => s.kind === 'text')[1];
  const r = await put('books', { [t.key]: 'หัวข้อใหม่ *เด่น*', [i.key]: `/media/${UUID}.webp`, [other.key]: other.default });
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys((await r.json()).values).sort(), [i.key, t.key].sort());   // unchanged value was dropped
  const html = fs.readFileSync(live('books'), 'utf8');
  assert.ok(html.includes('หัวข้อใหม่ <span>เด่น</span>') && html.includes(`src="/media/${UUID}.webp"`));
  assert.ok(!fs.existsSync(live('home')), 'other page untouched');
  assert.deepEqual((await get()).pages.books.values[t.key], 'หัวข้อใหม่ *เด่น*');
  assert.equal((await put('books', {})).status, 200);
  assert.ok(!fs.existsSync(live('books')), 'no overrides -> template is served');
});

test('PUT rejects unknown keys, empty or huge text, bad or missing images and unknown pages', async () => {
  const { pages } = await get();
  const t = pages.home.slots.find((s) => s.kind === 'text');
  const i = pages.home.slots.find((s) => s.kind === 'image');
  for (const bad of [{ 'nope.1': 'x' }, { [t.key]: '   ' }, { [t.key]: 'ก'.repeat(1001) }, { [t.key]: 5 },
    { [i.key]: '/etc/passwd' }, { [i.key]: '/media/../x.webp' }, { [i.key]: '/media/ffffffff-0000-4000-8000-0123456789ab.webp' }]) {
    const r = await put('home', bad);
    assert.equal(r.status, 400, JSON.stringify(bad).slice(0, 60));
    assert.match((await r.json()).errors[0].message, /[ก-๙]/);
  }
  assert.equal((await put('nope', {})).status, 404);
  assert.ok(!fs.existsSync(live('home')));
});

test('start-up renders saved overrides again (a deployed template change shows up after the restart)', async () => {
  const { pages } = await get();
  const t = pages.home.slots.find((s) => s.kind === 'text');
  assert.equal((await put('home', { [t.key]: 'ข้อความถาวร' })).status, 200);
  fs.rmSync(live('home'));
  createPagesAdmin({ siteDir: SITE, webDir: WEB });
  await new Promise((r) => setTimeout(r, 200));
  assert.ok(fs.readFileSync(live('home'), 'utf8').includes('ข้อความถาวร'));
});
