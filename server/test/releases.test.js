import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makePublish } from '../lib/releases.js';

function setup() {
  const site = fs.mkdtempSync(path.join(os.tmpdir(), 'kcut-rel-'));
  const releases = path.join(site, 'releases');
  fs.mkdirSync(releases);
  const mk = (name, mtime) => {
    const d = path.join(releases, name); fs.mkdirSync(d); fs.writeFileSync(path.join(d, 'index.html'), name);
    fs.utimesSync(d, mtime, mtime); return d;
  };
  return { site, releases, mk };
}
const read = (site) => fs.readFileSync(path.join(site, 'dist', 'index.html'), 'utf8');

test('publish moves a real dist aside once, then swaps the link', async () => {
  const { site, releases, mk } = setup();
  fs.mkdirSync(path.join(site, 'dist')); fs.writeFileSync(path.join(site, 'dist', 'index.html'), 'old');
  const publish = makePublish({ siteDir: site, releasesDir: releases });
  await publish(mk('r1', 1));
  assert.equal(read(site), 'r1');
  assert.ok(fs.readdirSync(releases).some((n) => n.startsWith('initial-')));
  await publish(mk('r2', 2));
  assert.equal(read(site), 'r2');
});

test('prune keeps newest 3 and never the live one', async () => {
  const { site, releases, mk } = setup();
  const publish = makePublish({ siteDir: site, releasesDir: releases, keep: 3 });
  for (let i = 1; i <= 6; i++) await publish(mk(`r${i}`, i));
  const left = fs.readdirSync(releases).sort();
  assert.deepEqual(left, ['r4', 'r5', 'r6']);
  assert.equal(read(site), 'r6');
});

test('makeBuild kills a hung build after the timeout and rejects', async () => {
  const { makeBuild } = await import('../lib/releases.js');
  const { site, releases } = setup();
  const build = makeBuild({ siteDir: site, releasesDir: releases, timeoutMs: 300, command: [process.execPath, ['-e', 'setTimeout(()=>{},60000)']] });
  const t0 = Date.now();
  await assert.rejects(build(), /timed out/);
  assert.ok(Date.now() - t0 < 5000);
});
