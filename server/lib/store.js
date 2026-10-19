// Order storage: SQLite (built-in node:sqlite, Node >= 22.13) in DATA_DIR/kcut.db; payment slips are files in DATA_DIR/slips.
// Status flow (manual review of the uploaded slip):  pending -> paid | rejected,  rejected -> paid.  `paid` is final.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function createStore(dataDir = process.env.DATA_DIR || path.resolve('data')) {
  const slipsDir = path.join(dataDir, 'slips');
  fs.mkdirSync(slipsDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'kcut.db'));
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS orders (
      id          TEXT PRIMARY KEY,
      status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','rejected')),
      amount      INTEGER NOT NULL,
      created_at  TEXT NOT NULL,
      reviewed_at TEXT,
      review_note TEXT,
      slip_hash   TEXT,
      data        TEXT NOT NULL            -- full order as JSON (customer, address, package, slip file name)
    );
    CREATE INDEX IF NOT EXISTS orders_created ON orders (created_at DESC);
    CREATE INDEX IF NOT EXISTS orders_slip_hash ON orders (slip_hash);
  `);

  const q = {
    insert: db.prepare('INSERT INTO orders (id, status, amount, created_at, slip_hash, data) VALUES (?, ?, ?, ?, ?, ?)'),
    get: db.prepare('SELECT * FROM orders WHERE id = ?'),
    list: db.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT ?'),
    setStatus: db.prepare('UPDATE orders SET status = ?, reviewed_at = ?, review_note = ? WHERE id = ?'),
    byHash: db.prepare('SELECT id FROM orders WHERE slip_hash = ? AND id != ? ORDER BY created_at LIMIT 1'),
  };
  const toOrder = (r) => r && ({ ...JSON.parse(r.data), status: r.status, reviewedAt: r.reviewed_at, reviewNote: r.review_note });
  const types = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

  return {
    name: `sqlite (${path.join(dataDir, 'kcut.db')})`,
    create(order, slip) {
      if (slip) {
        fs.writeFileSync(path.join(slipsDir, slip.file), slip.data);
        order.slipFile = slip.file;
        order.slipHash = slip.hash;
      }
      q.insert.run(order.id, order.status, order.amount, order.createdAt, slip ? slip.hash : null, JSON.stringify(order));
      return order;
    },
    list(limit = 500) { return q.list.all(limit).map(toOrder); },
    get(id) { return toOrder(q.get.get(id)); },
    // the id of an EARLIER order that used the identical slip file (re-used slip), or null
    duplicateOf(hash, id) { return hash ? q.byHash.get(hash, id)?.id ?? null : null; },
    // returns null (unknown id) or { order, changed } ; changed=false when nothing had to change
    review(id, status, note = '') {
      const row = q.get.get(id);
      if (!row) return null;
      const allowed = status === 'paid' ? row.status !== 'paid' : row.status === 'pending';
      if (!allowed) return { order: toOrder(row), changed: false };
      q.setStatus.run(status, new Date().toISOString(), note || null, id);
      return { order: this.get(id), changed: true };
    },
    slipFile(name) {
      if (!/^[A-Za-z0-9-]+\.(jpg|png|webp)$/.test(name)) return null;
      const f = path.join(slipsDir, name);
      return fs.existsSync(f) ? { contentType: types[name.split('.').pop()], data: fs.readFileSync(f) } : null;
    },
    close() { db.close(); },
  };
}
