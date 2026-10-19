import test from 'node:test';
import assert from 'node:assert/strict';
import { createBuilder } from '../lib/builder.js';

const deferred = () => { let resolve, reject; const p = new Promise((a, b) => { resolve = a; reject = b; }); return { p, resolve, reject }; };

test('idle -> building -> ok', async () => {
  const published = [];
  const b = createBuilder({ build: async () => '/r/1', publish: async (d) => { published.push(d); } });
  assert.equal(b.status().state, 'idle');
  const done = b.trigger();
  assert.equal(b.status().state, 'building');
  await done;
  assert.equal(b.status().state, 'ok');
  assert.deepEqual(published, ['/r/1']);
});

test('triggers during a build coalesce into exactly one more build', async () => {
  const gates = [deferred(), deferred(), deferred()];
  let n = 0;
  const b = createBuilder({ build: () => gates[n++].p.then(() => `/r/${n}`), publish: async () => {} });
  const done = b.trigger();
  b.trigger(); b.trigger(); b.trigger();
  gates[0].resolve(); await new Promise((r) => setImmediate(r));
  gates[1].resolve();
  await done;
  assert.equal(n, 2);
  assert.equal(b.status().state, 'ok');
});

test('failure is reported and does not publish; next trigger recovers', async () => {
  let fail = true; const published = [];
  const b = createBuilder({
    build: async () => { if (fail) throw new Error('astro exploded'); return '/r/2'; },
    publish: async (d) => { published.push(d); },
  });
  await b.trigger();
  assert.equal(b.status().state, 'failed');
  assert.match(b.status().message, /astro exploded/);
  assert.deepEqual(published, []);
  fail = false;
  await b.trigger();
  assert.equal(b.status().state, 'ok');
  assert.deepEqual(published, ['/r/2']);
});
