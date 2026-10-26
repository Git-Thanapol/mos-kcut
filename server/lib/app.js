// HTTP app: POST /api/order, and a password-protected admin (/admin) for the manual slip review.
import http from 'node:http';
import crypto from 'node:crypto';
import { esc, baht } from './mailer.js';
import { parseOrder } from './validate.js';
import { createRateLimiter } from './ratelimit.js';

const STATUS_TH = { pending: 'รอตรวจสลิป', paid: 'ชำระแล้ว', rejected: 'สลิปไม่ผ่าน' };

function adminPage(orders, dupOf, filter) {
  const counts = { all: orders.length, pending: 0, paid: 0, rejected: 0 };
  orders.forEach((o) => counts[o.status]++);
  const shown = filter === 'all' ? orders : orders.filter((o) => o.status === filter);
  const tab = (key, label) => `<a href="/admin?status=${key}" class="${filter === key ? 'on' : ''}">${label} (${counts[key]})</a>`;
  const rows = shown.map((o) => {
    const dup = dupOf.get(o.id);
    const slip = o.slipFile
      ? `<a href="/admin/slips/${esc(o.slipFile)}" target="_blank"><img src="/admin/slips/${esc(o.slipFile)}" loading="lazy" alt="สลิป ${esc(o.id)}"></a>${dup ? `<div class="warn">⚠ สลิปซ้ำกับ ${esc(dup)}</div>` : ''}`
      : '<small>ไม่มีสลิป (เก็บเงินปลายทาง)</small>';
    const actions = o.status === 'paid' ? ''
      : `<button class="ok" data-act="paid" data-id="${esc(o.id)}">ยืนยันว่าชำระแล้ว</button>${o.status === 'pending' ? `<button class="no" data-act="reject" data-id="${esc(o.id)}">สลิปไม่ผ่าน</button>` : ''}`;
    return `<tr class="${esc(o.status)}">
      <td><b>${esc(o.id)}</b><br><small>${esc(new Date(o.createdAt).toLocaleString('th-TH'))}</small></td>
      <td>${esc(o.firstName)} ${esc(o.lastName)}<br><small>โทร ${esc(o.phone)}${o.email ? '<br>' + esc(o.email) : ''}</small></td>
      <td>${esc(o.packageName)}<br><b>${baht(o.amount)} บาท</b><br><small>${o.payment === 'transfer' ? 'โอนเงิน' : 'เก็บเงินปลายทาง'}</small></td>
      <td><small>${esc(o.address1)} ${esc(o.subdistrict)} ${esc(o.district)} ${esc(o.province)} ${esc(o.zip)}${o.note ? '<br>หมายเหตุ: ' + esc(o.note) : ''}</small></td>
      <td>${slip}</td>
      <td><span class="st">${STATUS_TH[o.status]}</span>${o.reviewNote ? `<br><small>${esc(o.reviewNote)}</small>` : ''}<div>${actions}</div></td></tr>`;
  }).join('');
  return `<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ตรวจสลิป</title><style>
body{font-family:system-ui,sans-serif;margin:16px;background:#f1f5f9;color:#0f172a}h1{font-size:20px}nav{margin:12px 0;display:flex;gap:8px;flex-wrap:wrap}
nav a{padding:8px 14px;border-radius:999px;background:#fff;border:1px solid #cbd5e1;text-decoration:none;color:#0f172a;font-size:14px}nav a.on{background:#0a1224;color:#fff}
.w{overflow-x:auto}table{border-collapse:collapse;width:100%;background:#fff;min-width:860px}td,th{border:1px solid #e2e8f0;padding:8px;text-align:left;vertical-align:top;font-size:14px}th{background:#0a1224;color:#fff}
td img{width:110px;max-height:150px;object-fit:cover;border-radius:6px;border:1px solid #cbd5e1}.warn{color:#b91c1c;font-weight:700;font-size:12px;margin-top:4px}
tr.paid{background:#f0fdf4}tr.rejected{background:#fef2f2}.st{font-weight:700}button{border:0;padding:8px 12px;border-radius:8px;font-weight:700;cursor:pointer;margin:6px 6px 0 0}
.ok{background:#f59e0b}.no{background:#e2e8f0}</style>
<h1>ตรวจสลิปและออเดอร์</h1>
<nav><a href="/admin/content">✎ จัดการเนื้อหาเว็บ</a>${tab('pending', 'รอตรวจสลิป')}${tab('paid', 'ชำระแล้ว')}${tab('rejected', 'สลิปไม่ผ่าน')}${tab('all', 'ทั้งหมด')}</nav>
<div class="w"><table><tr><th>เลขที่</th><th>ลูกค้า</th><th>แพ็คเกจ</th><th>ที่อยู่</th><th>สลิป</th><th>สถานะ</th></tr>${rows || '<tr><td colspan="6">ไม่มีรายการ</td></tr>'}</table></div>
<script>document.querySelectorAll('button[data-act]').forEach(b=>b.onclick=async()=>{const reject=b.dataset.act==='reject';let note='';
if(reject){note=prompt('เหตุผลที่สลิปไม่ผ่าน (ไม่บังคับ ส่งให้ลูกค้าทางอีเมลถ้ามี)');if(note===null)return}
else if(!confirm('ยืนยันว่าได้รับเงินแล้ว? ระบบจะส่งอีเมลถึงลูกค้าและร้าน'))return;
b.disabled=true;const r=await fetch('/api/admin/orders/'+b.dataset.id+'/'+(reject?'reject':'paid'),{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'kcut-admin'},body:JSON.stringify({note})});
const j=await r.json().catch(()=>({}));if(r.ok){location.reload()}else{alert(j.error||'ผิดพลาด');b.disabled=false}});</script></html>`;
}

export function createApp({ store, mailer, adminPassword, trustProxy = false, rateLimit = 10, contentAdmin = null, pagesAdmin = null }) {
  const authFails = createRateLimiter();   // 5 wrong admin passwords / 15 min / IP
  const hits = new Map();   // in-memory limit: `rateLimit` orders / 10 min / IP
  const limited = (ip) => {
    const now = Date.now();
    const arr = (hits.get(ip) || []).filter((t) => now - t < 600_000);
    arr.push(now); hits.set(ip, arr);
    return arr.length > rateLimit;
  };

  const send = (res, code, body, type = 'application/json; charset=utf-8', extra = {}) => {
    res.writeHead(code, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', ...extra });
    res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
  };
  // Over the limit we stop buffering but keep draining, so the client receives our 413 message instead of a reset
  // connection; a body 4x over the limit is simply cut off.
  const readBody = (req, max = 7 * 1024 * 1024) => new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size <= max) chunks.push(c);
      else if (size > max * 4) req.destroy();
    });
    req.on('end', () => (size > max ? reject(Object.assign(new Error('too large'), { code: 413 })) : resolve(Buffer.concat(chunks).toString('utf8'))));
    req.on('error', reject);
  });
  const sha = (s) => crypto.createHash('sha256').update(s).digest();
  const isAdmin = (req) => {
    const m = /^Basic (.+)$/.exec(req.headers.authorization || '');
    if (!m) return false;
    const pass = Buffer.from(m[1], 'base64').toString().split(':').slice(1).join(':');
    return crypto.timingSafeEqual(sha(pass), sha(adminPassword));
  };
  const deny = (res) => send(res, 401, 'ต้องเข้าสู่ระบบ', 'text/plain; charset=utf-8', { 'WWW-Authenticate': 'Basic realm="KCUT admin", charset="UTF-8"' });

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const ip = (trustProxy && req.headers['x-real-ip']) || req.socket.remoteAddress;
    try {
      if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, { ok: true, store: store.name, mailer: mailer.name });

      if (req.method === 'POST' && url.pathname === '/api/order') {
        if (limited(ip)) return send(res, 429, { error: 'ส่งคำสั่งซื้อถี่เกินไป กรุณารอสักครู่แล้วลองใหม่' });
        let body;
        try { body = JSON.parse(await readBody(req)); } catch (e) { return send(res, e.code === 413 ? 413 : 400, { error: e.code === 413 ? 'ไฟล์ที่แนบใหญ่เกินไป' : 'ข้อมูลไม่ถูกต้อง' }); }
        const parsed = parseOrder(body);
        if (parsed.error) return send(res, 400, { error: parsed.error });
        store.create(parsed.order, parsed.slip);
        console.log(`[order] ${parsed.order.id} ${parsed.order.amount} THB ${parsed.order.payment}`);
        mailer.orderReceived(parsed.order, store.duplicateOf(parsed.slip?.hash, parsed.order.id));   // fire and forget
        return send(res, 201, { orderId: parsed.order.id, amount: parsed.order.amount });
      }

      if (url.pathname === '/admin' || url.pathname.startsWith('/admin/') || url.pathname.startsWith('/api/admin/')) {
        if (authFails.isBlocked(ip)) return send(res, 429, { error: 'ลองผิดหลายครั้งเกินไป กรุณารอ 15 นาที' });
        if (!isAdmin(req)) { if (req.headers.authorization) authFails.fail(ip); return deny(res); }
        authFails.reset(ip);
        if (contentAdmin && await contentAdmin(req, res, url, { send, readBody })) return;
        if (pagesAdmin && await pagesAdmin(req, res, url, { send, readBody })) return;
        if (req.method === 'GET' && url.pathname === '/admin') {
          const orders = store.list();
          const dupOf = new Map(orders.map((o) => [o.id, store.duplicateOf(o.slipHash, o.id)]).filter(([, d]) => d));
          const f = url.searchParams.get('status');
          return send(res, 200, adminPage(orders, dupOf, ['pending', 'paid', 'rejected', 'all'].includes(f) ? f : 'pending'), 'text/html; charset=utf-8');
        }
        let m;
        if (req.method === 'GET' && (m = /^\/admin\/slips\/([^/]+)$/.exec(url.pathname))) {
          const f = store.slipFile(m[1]);
          return f ? send(res, 200, f.data, f.contentType, { 'Cache-Control': 'private, max-age=3600' }) : send(res, 404, 'ไม่พบไฟล์', 'text/plain; charset=utf-8');
        }
        if (req.method === 'POST' && (m = /^\/api\/admin\/orders\/([A-Za-z0-9-]+)\/(paid|reject)$/.exec(url.pathname))) {
          // CSRF: browsers send cached Basic credentials cross-site, but not custom headers
          if (req.headers['x-requested-with'] !== 'kcut-admin') return send(res, 403, { error: 'คำขอไม่ถูกต้อง' });
          let note = '';
          try { note = String(JSON.parse((await readBody(req, 10_000)) || '{}').note || '').trim().slice(0, 300); } catch { /* no body */ }
          const status = m[2] === 'paid' ? 'paid' : 'rejected';
          const r = store.review(m[1], status, note);
          if (!r) return send(res, 404, { error: 'ไม่พบออเดอร์' });
          if (!r.changed) return send(res, 409, { error: 'สถานะนี้ไม่สามารถเปลี่ยนได้ (ออเดอร์ชำระแล้ว หรือถูกตั้งสถานะนี้ไปแล้ว)' });
          const emailOk = status === 'paid' ? await mailer.orderPaid(r.order) : await mailer.orderRejected(r.order, note);
          return send(res, 200, { ok: true, status, emailOk });
        }
      }
      send(res, 404, { error: 'not found' });
    } catch (err) {
      console.error('[error]', err.message);
      send(res, 500, { error: 'เกิดข้อผิดพลาดของเซิร์ฟเวอร์ กรุณาลองใหม่หรือทักไลน์ @spgo' });
    }
  });
}
