// Order storage. Two interchangeable backends with the same interface:
//   file     (default, MOCK)  -> data/orders.json + data/slips/*
//   supabase (set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) -> table `orders` + Storage bucket `slips`
//                                (see ../supabase.sql — NOT yet tested against a real project)
// Interface: create(order, slip) -> order | list() -> order[] | get(id) | markPaid(id) -> {order, changed}
//            slipFile(name) -> {contentType, data} | null
import fs from 'node:fs';
import path from 'node:path';

const DATA = process.env.DATA_DIR || path.resolve('data');

function fileStore() {
  const ordersFile = path.join(DATA, 'orders.json');
  const slipsDir = path.join(DATA, 'slips');
  fs.mkdirSync(slipsDir, { recursive: true });
  const read = () => (fs.existsSync(ordersFile) ? JSON.parse(fs.readFileSync(ordersFile, 'utf8')) : []);
  const write = (all) => {
    fs.writeFileSync(ordersFile + '.tmp', JSON.stringify(all, null, 2));
    fs.renameSync(ordersFile + '.tmp', ordersFile);   // atomic replace
  };
  const types = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
  return {
    name: 'file (mock)',
    async create(order, slip) {
      if (slip) {
        fs.writeFileSync(path.join(slipsDir, slip.file), slip.data);
        order.slipFile = slip.file;
      }
      const all = read(); all.push(order); write(all);
      return order;
    },
    async list() { return read().reverse(); },
    async get(id) { return read().find((o) => o.id === id) || null; },
    async markPaid(id) {
      const all = read();
      const o = all.find((x) => x.id === id);
      if (!o) return null;
      if (o.status === 'paid') return { order: o, changed: false };
      o.status = 'paid'; o.paidAt = new Date().toISOString();
      write(all);
      return { order: o, changed: true };
    },
    async slipFile(name) {
      if (!/^[A-Za-z0-9-]+\.(jpg|png|webp)$/.test(name)) return null;
      const f = path.join(slipsDir, name);
      return fs.existsSync(f) ? { contentType: types[name.split('.').pop()], data: fs.readFileSync(f) } : null;
    },
  };
}

function supabaseStore(url, key) {
  const h = { apikey: key, Authorization: `Bearer ${key}` };
  const rest = (q, init = {}) => fetch(`${url}/rest/v1/orders${q}`, { ...init, headers: { ...h, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  const row = (o) => ({ id: o.id, status: o.status, amount: o.amount, created_at: o.createdAt, paid_at: o.paidAt || null, data: o });
  const unrow = (r) => ({ ...r.data, status: r.status, paidAt: r.paid_at });
  const ok = async (res) => { if (!res.ok) throw new Error(`supabase ${res.status}: ${await res.text()}`); return res; };
  return {
    name: 'supabase',
    async create(order, slip) {
      if (slip) {
        await ok(await fetch(`${url}/storage/v1/object/slips/${slip.file}`, { method: 'POST', headers: { ...h, 'Content-Type': slip.contentType }, body: slip.data }));
        order.slipFile = slip.file;
      }
      await ok(await rest('', { method: 'POST', body: JSON.stringify(row(order)) }));
      return order;
    },
    async list() { return (await (await ok(await rest('?select=*&order=created_at.desc&limit=200'))).json()).map(unrow); },
    async get(id) { const r = await (await ok(await rest(`?id=eq.${encodeURIComponent(id)}&select=*`))).json(); return r[0] ? unrow(r[0]) : null; },
    async markPaid(id) {
      const body = JSON.stringify({ status: 'paid', paid_at: new Date().toISOString() });
      const r = await (await ok(await rest(`?id=eq.${encodeURIComponent(id)}&status=neq.paid`, { method: 'PATCH', body, headers: { Prefer: 'return=representation' } }))).json();
      if (r[0]) return { order: unrow(r[0]), changed: true };
      const existing = await this.get(id);
      return existing ? { order: existing, changed: false } : null;
    },
    async slipFile(name) {
      if (!/^[A-Za-z0-9-]+\.(jpg|png|webp)$/.test(name)) return null;
      const res = await fetch(`${url}/storage/v1/object/slips/${name}`, { headers: h });
      return res.ok ? { contentType: res.headers.get('content-type'), data: Buffer.from(await res.arrayBuffer()) } : null;
    },
  };
}

export function createStore() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  return SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY ? supabaseStore(SUPABASE_URL.replace(/\/$/, ''), SUPABASE_SERVICE_ROLE_KEY) : fileStore();
}
