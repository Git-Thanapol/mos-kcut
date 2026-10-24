// Run: npm test   (uses a throw-away temp folder; no network, no real email)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'kcut-test-'));
process.env.DATA_DIR = DIR;
delete process.env.SMTP_PASS;   // force the mock mailer

const { createStore } = await import('../lib/store.js');
const { createMailer } = await import('../lib/mailer.js');
const { createApp } = await import('../lib/app.js');
const { parseOrder, PACKAGES } = await import('../lib/validate.js');

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const PNG2 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const base = (over = {}) => ({
  package: '390', payment: 'transfer', firstName: 'สมชาย', lastName: 'ใจดี', phone: '0812345678', email: 'buyer@example.com',
  address1: '12/34 ซอย 5', subdistrict: 'คลองเตย', district: 'คลองเตย', province: 'กรุงเทพมหานคร', zip: '10110', note: '',
  slip: { name: 's.png', dataUrl: PNG }, ...over,
});

let server, origin, store;
const auth = { Authorization: 'Basic ' + Buffer.from('admin:secret').toString('base64'), 'X-Requested-With': 'kcut-admin' };
const post = (p, body, headers = {}) => fetch(origin + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const outbox = () => (fs.existsSync(path.join(DIR, 'outbox')) ? fs.readdirSync(path.join(DIR, 'outbox')) : []);

before(async () => {
  store = createStore(DIR);
  server = createApp({ store, mailer: createMailer(), adminPassword: 'secret', rateLimit: 1000 });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); store.close(); fs.rmSync(DIR, { recursive: true, force: true }); });

test('validation: price comes from the server, bad input is rejected with a Thai message', () => {
  assert.equal(parseOrder({ ...base(), amount: 1 }).order.amount, 390);                 // client "amount" is ignored
  assert.equal(parseOrder(base({ package: '5990' })).order.amount, 5990);
  assert.ok(!PACKAGES['1']);
  for (const bad of [base({ package: '1' }), base({ phone: '123' }), base({ email: 'nope' }), base({ firstName: '' }),
    base({ zip: '1011' }), base({ payment: 'bitcoin' }), base({ slip: null }), base({ slip: { dataUrl: 'data:text/html;base64,PGI+' } }),
    base({ slip: { dataUrl: 'data:image/png;base64,AAAAAAAA' } })]) {            // wrong magic bytes
    assert.match(parseOrder(bad).error, /[ก-๙]/);
  }
  assert.ok(parseOrder(base({ payment: 'cod', slip: null })).order, 'cash on delivery needs no slip');
});

test('POST /api/order stores a pending order + slip file and emails the shop', async () => {
  const res = await post('/api/order', base());
  assert.equal(res.status, 201);
  const { orderId, amount } = await res.json();
  assert.equal(amount, 390);   // the Meta Pixel Purchase value is taken from this
  assert.match(orderId, /^KC-\d{6}-[0-9A-F]{6}$/);
  const o = store.get(orderId);
  assert.equal(o.status, 'pending'); assert.equal(o.amount, 390); assert.ok(fs.existsSync(path.join(DIR, 'slips', o.slipFile)));
  await new Promise((r) => setTimeout(r, 100));
  assert.ok(outbox().some((f) => f.includes('shop@example.invalid')), 'shop notified of the new order');
});

test('book orders (345 / 490) are stored as BK- orders with their own package name', async () => {
  assert.equal(parseOrder(base({ package: '345' })).order.product, 'book');
  assert.equal(parseOrder(base()).order.product, 'kcut');
  for (const [pkg, name] of [['345', 'หนังสือ AI 1 เล่ม'], ['490', 'หนังสือ AI + เว็บ Prompt']]) {
    const res = await post('/api/order', base({ package: pkg, payment: 'cod', slip: null }));
    assert.equal(res.status, 201);
    const { orderId, amount } = await res.json();
    assert.equal(amount, Number(pkg));
    assert.match(orderId, /^BK-\d{6}-[0-9A-F]{6}$/);
    const o = store.get(orderId);
    assert.equal(o.amount, Number(pkg)); assert.equal(o.packageName, name); assert.equal(o.product, 'book');
  }
  await new Promise((r) => setTimeout(r, 100));
  const subjects = outbox().map((f) => fs.readFileSync(path.join(DIR, 'outbox', f), 'utf8'));
  assert.ok(subjects.some((t) => t.includes('Subject: [หนังสือ AI] ออเดอร์ใหม่ BK-')), 'shop mail names the book shop');
  assert.equal((await post('/api/order', base({ package: '400' }))).status, 400);
});

test('POST /api/order rejects bad requests', async () => {
  assert.equal((await post('/api/order', base({ phone: 'x' }))).status, 400);
  assert.equal((await fetch(origin + '/api/order', { method: 'POST', body: 'not json' })).status, 400);
  assert.equal((await post('/api/order', base({ slip: { dataUrl: 'data:image/png;base64,' + 'A'.repeat(8 * 1024 * 1024) } }))).status, 413);
});

test('admin needs the password', async () => {
  assert.equal((await fetch(origin + '/admin')).status, 401);
  assert.equal((await fetch(origin + '/admin', { headers: { Authorization: 'Basic ' + Buffer.from('a:wrong').toString('base64') } })).status, 401);
  assert.equal((await post('/api/admin/orders/KC-1/paid', {})).status, 401);
  assert.equal((await fetch(origin + '/admin/slips/x.png')).status, 401);
  const page = await fetch(origin + '/admin', { headers: auth });
  assert.equal(page.status, 200); assert.match(await page.text(), /ตรวจสลิป/);
});

test('mark paid: emails once, a second click changes nothing', async () => {
  const { orderId } = await (await post('/api/order', base({ email: 'paid@example.com' }))).json();
  const before = outbox().length;
  const r1 = await post(`/api/admin/orders/${orderId}/paid`, {}, auth);
  assert.equal(r1.status, 200); assert.equal((await r1.json()).emailOk, true);
  assert.equal(store.get(orderId).status, 'paid');
  assert.equal(outbox().length, before + 2, 'one email to the shop, one to the customer');
  assert.ok(outbox().some((f) => f.includes('paid@example.com')));
  assert.equal((await post(`/api/admin/orders/${orderId}/paid`, {}, auth)).status, 409);
  assert.equal(outbox().length, before + 2, 'no duplicate emails');
  assert.equal((await post(`/api/admin/orders/${orderId}/reject`, { note: 'x' }, auth)).status, 409, 'paid is final');
});

test('reject keeps the order, stores the reason, emails the customer; it can still be paid later', async () => {
  const { orderId } = await (await post('/api/order', base({ email: 'rej@example.com', slip: { dataUrl: PNG2 } }))).json();
  const r = await post(`/api/admin/orders/${orderId}/reject`, { note: 'ยอดไม่ตรง' }, auth);
  assert.equal(r.status, 200);
  const o = store.get(orderId);
  assert.equal(o.status, 'rejected'); assert.equal(o.reviewNote, 'ยอดไม่ตรง');
  assert.ok(outbox().some((f) => f.includes('rej@example.com')));
  assert.equal((await post(`/api/admin/orders/${orderId}/reject`, {}, auth)).status, 409, 'cannot reject twice');
  assert.equal((await post(`/api/admin/orders/${orderId}/paid`, {}, auth)).status, 200);
  assert.equal(store.get(orderId).status, 'paid');
  assert.equal((await post('/api/admin/orders/KC-NOPE/paid', {}, auth)).status, 404);
});

test('re-used slip image is flagged against the earlier order', async () => {
  const a = await (await post('/api/order', base({ slip: { dataUrl: PNG } }))).json();
  const b = await (await post('/api/order', base({ slip: { dataUrl: PNG } }))).json();
  assert.equal(store.duplicateOf(store.get(b.orderId).slipHash, b.orderId) !== null, true);
  const html = await (await fetch(origin + '/admin?status=all', { headers: auth })).text();
  assert.match(html, /สลิปซ้ำกับ/);
  assert.ok(a.orderId !== b.orderId);
});

test('admin HTML escapes customer input (no script injection)', async () => {
  const { orderId } = await (await post('/api/order', base({ firstName: '<script>alert(1)</script>', slip: { dataUrl: PNG2 } }))).json();
  const html = await (await fetch(origin + '/admin?status=all', { headers: auth })).text();
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;') && orderId);
});

test('order rate limit', async () => {
  const limited = createApp({ store, mailer: createMailer(), adminPassword: 'x', rateLimit: 2 });
  await new Promise((r) => limited.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${limited.address().port}/api/order`;
  const codes = [];
  for (let i = 0; i < 3; i++) codes.push((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(base({ phone: 'bad' })) })).status);
  limited.close();
  assert.deepEqual(codes, [400, 400, 429]);
});
