// KCUT order API: POST /api/order, plus a small password-protected admin (/admin) to view orders and mark them paid.
// Run: node server.js   (reads config from environment, see .env.example)
import http from 'node:http';
import crypto from 'node:crypto';
import { createStore } from './lib/store.js';
import { createMailer, esc, baht } from './lib/mailer.js';
import { parseOrder } from './lib/validate.js';

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const TRUST_PROXY = process.env.TRUST_PROXY === '1';           // set behind nginx so X-Real-IP is used
let ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) {                                           // never run with a guessable default
  ADMIN_PASSWORD = crypto.randomBytes(9).toString('base64url');
  console.warn(`[admin] ADMIN_PASSWORD not set — temporary password for this run: ${ADMIN_PASSWORD}`);
}

const store = createStore();
const mailer = createMailer();

// ---- tiny in-memory rate limit: 10 orders / 10 min / IP
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 600_000);
  arr.push(now); hits.set(ip, arr);
  return arr.length > 10;
}

const send = (res, code, body, type = 'application/json; charset=utf-8', extra = {}) => {
  res.writeHead(code, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', ...extra });
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
};

function readBody(req, max = 7 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > max) { reject(Object.assign(new Error('too large'), { code: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function isAdmin(req) {
  const m = /^Basic (.+)$/.exec(req.headers.authorization || '');
  if (!m) return false;
  const pass = Buffer.from(m[1], 'base64').toString().split(':').slice(1).join(':');
  const a = crypto.createHash('sha256').update(pass).digest(), b = crypto.createHash('sha256').update(ADMIN_PASSWORD).digest();
  return crypto.timingSafeEqual(a, b);
}
const deny = (res) => send(res, 401, 'ต้องเข้าสู่ระบบ', 'text/plain; charset=utf-8', { 'WWW-Authenticate': 'Basic realm="KCUT admin", charset="UTF-8"' });

function adminPage(orders) {
  const rows = orders.map((o) => `<tr>
    <td>${esc(o.id)}<br><small>${esc(new Date(o.createdAt).toLocaleString('th-TH'))}</small></td>
    <td>${esc(o.firstName)} ${esc(o.lastName)}<br><small>${esc(o.phone)} ${esc(o.email)}</small></td>
    <td>${esc(o.packageName)}<br><b>${baht(o.amount)} บาท</b><br><small>${o.payment === 'transfer' ? 'โอน' : 'ปลายทาง'}</small></td>
    <td><small>${esc(o.address1)} ${esc(o.subdistrict)} ${esc(o.district)} ${esc(o.province)} ${esc(o.zip)}${o.note ? '<br>หมายเหตุ: ' + esc(o.note) : ''}</small></td>
    <td>${o.slipFile ? `<a href="/admin/slips/${esc(o.slipFile)}" target="_blank">ดูสลิป</a>` : '-'}</td>
    <td>${o.status === 'paid' ? `<span class="paid">ชำระแล้ว</span>` : `<button data-id="${esc(o.id)}">ยืนยันว่าชำระแล้ว</button>`}</td></tr>`).join('');
  return `<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>KCUT ออเดอร์</title><style>body{font-family:sans-serif;margin:16px;background:#f1f5f9}table{border-collapse:collapse;width:100%;background:#fff}
td,th{border:1px solid #e2e8f0;padding:8px;text-align:left;vertical-align:top;font-size:14px}th{background:#0a1224;color:#fff}.paid{color:#15803d;font-weight:700}
button{background:#f59e0b;border:0;padding:8px 12px;border-radius:8px;font-weight:700;cursor:pointer}@media(max-width:700px){.w{overflow-x:auto}}</style>
<h1>ออเดอร์ทั้งหมด (${orders.length})</h1><div class="w"><table><tr><th>เลขที่</th><th>ลูกค้า</th><th>แพ็คเกจ</th><th>ที่อยู่</th><th>สลิป</th><th>สถานะ</th></tr>${rows || '<tr><td colspan=6>ยังไม่มีออเดอร์</td></tr>'}</table></div>
<script>document.querySelectorAll('button[data-id]').forEach(b=>b.onclick=async()=>{if(!confirm('ยืนยันว่าชำระเงินแล้ว? ระบบจะส่งอีเมลถึงลูกค้าและร้าน'))return;b.disabled=true;
const r=await fetch('/api/admin/orders/'+b.dataset.id+'/paid',{method:'POST'});const j=await r.json();if(r.ok){alert(j.emailOk===false?'บันทึกแล้ว แต่ส่งอีเมลไม่สำเร็จ ดู log ของเซิร์ฟเวอร์':'บันทึกแล้ว ส่งอีเมลแล้ว');location.reload()}else{alert(j.error||'ผิดพลาด');b.disabled=false}});</script></html>`;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const ip = (TRUST_PROXY && req.headers['x-real-ip']) || req.socket.remoteAddress;
  try {
    if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, { ok: true, store: store.name, mailer: mailer.name });

    if (req.method === 'POST' && url.pathname === '/api/order') {
      if (limited(ip)) return send(res, 429, { error: 'ส่งคำสั่งซื้อถี่เกินไป กรุณารอสักครู่แล้วลองใหม่' });
      let body;
      try { body = JSON.parse(await readBody(req)); } catch (e) { return send(res, e.code === 413 ? 413 : 400, { error: e.code === 413 ? 'ไฟล์ที่แนบใหญ่เกินไป' : 'ข้อมูลไม่ถูกต้อง' }); }
      const parsed = parseOrder(body);
      if (parsed.error) return send(res, 400, { error: parsed.error });
      await store.create(parsed.order, parsed.slip);
      console.log(`[order] ${parsed.order.id} ${parsed.order.amount} THB ${parsed.order.payment}`);
      return send(res, 201, { orderId: parsed.order.id });
    }

    if (url.pathname === '/admin' || url.pathname.startsWith('/admin/') || url.pathname.startsWith('/api/admin/')) {
      if (!isAdmin(req)) return deny(res);
      if (req.method === 'GET' && url.pathname === '/admin') return send(res, 200, adminPage(await store.list()), 'text/html; charset=utf-8');
      let m;
      if (req.method === 'GET' && (m = /^\/admin\/slips\/([^/]+)$/.exec(url.pathname))) {
        const f = await store.slipFile(m[1]);
        return f ? send(res, 200, f.data, f.contentType) : send(res, 404, 'ไม่พบไฟล์', 'text/plain; charset=utf-8');
      }
      if (req.method === 'POST' && (m = /^\/api\/admin\/orders\/([A-Za-z0-9-]+)\/paid$/.exec(url.pathname))) {
        const r = await store.markPaid(m[1]);
        if (!r) return send(res, 404, { error: 'ไม่พบออเดอร์' });
        const emailOk = r.changed ? await mailer.orderPaid(r.order) : null;   // emails only on the first transition to paid
        return send(res, 200, { ok: true, changed: r.changed, emailOk });
      }
    }
    send(res, 404, { error: 'not found' });
  } catch (err) {
    console.error('[error]', err.message);
    send(res, 500, { error: 'เกิดข้อผิดพลาดของเซิร์ฟเวอร์ กรุณาลองใหม่หรือทักไลน์ @spgo' });
  }
});

server.listen(PORT, HOST, () => console.log(`KCUT API on http://${HOST}:${PORT}  store=${store.name}  mailer=${mailer.name}`));
