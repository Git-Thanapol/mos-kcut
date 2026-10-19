import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults } from '../../site/src/data/defaults.ts';
import { validateContent, collectPaths } from '../lib/schema.js';

const known = collectPaths(defaults);
const clone = () => structuredClone(defaults);

test('defaults are valid', () => {
  const r = validateContent(defaults, known);
  assert.deepEqual(r.errors, []);
  assert.equal(r.ok, true);
});

test('collectPaths finds hero, feature, clip and review media', () => {
  assert.ok(known.has('/pic1.webp'));
  assert.ok(known.has('/video-demo.mp4'));
  assert.ok(known.has('/cover1.webp'));
  assert.ok(known.has('/chat3.webp'));
});

test('wrong counts are rejected', () => {
  const c = clone(); c.features.pop();
  const r = validateContent(c, known);
  assert.equal(r.ok, false);
  assert.equal(r.errors[0].field, 'features');
});

test('path traversal and unknown paths are rejected', () => {
  for (const bad of ['/media/../../etc/passwd.png', '//evil.com/x.png', '/other/x.png', 'media/x.png', '/media/x.exe']) {
    const c = clone(); c.hero.image = bad;
    assert.equal(validateContent(c, known).ok, false, bad);
  }
});

test('/media/ paths and known default paths are accepted', () => {
  const c = clone(); c.hero.image = '/media/abc-123.webp';
  assert.equal(validateContent(c, known).ok, true);
});

test('rating must be integer 1-5', () => {
  for (const bad of [0, 6, 4.5, '5', null]) {
    const c = clone(); c.reviews[0].rating = bad;
    assert.equal(validateContent(c, known).ok, false, String(bad));
  }
});

test('strings: non-empty, length counted in characters, Thai/emoji/newlines kept', () => {
  const c = clone();
  c.reviews[0].headline = 'สวัสดี\nชาวโลก 🎬';
  assert.equal(validateContent(c, known).ok, true);
  c.features[0].title = '';
  assert.equal(validateContent(c, known).ok, false);
  const d = clone(); d.features[0].title = '🎬'.repeat(120);   // 120 chars = 240 UTF-16 units
  assert.equal(validateContent(d, known).ok, true);
  d.features[0].title = '🎬'.repeat(121);
  assert.equal(validateContent(d, known).ok, false);
});

test('non-object input is rejected without throwing', () => {
  for (const bad of [null, 42, 'x', [], { hero: null }]) {
    assert.equal(validateContent(bad, known).ok, false);
  }
});
