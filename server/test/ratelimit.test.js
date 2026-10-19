import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter } from '../lib/ratelimit.js';

test('blocks after max failures until the window ends; keys are independent; reset clears', () => {
  const l = createRateLimiter({ max: 5, windowMs: 1000 });
  for (let i = 0; i < 5; i++) { assert.equal(l.isBlocked('ip', 0), false); l.fail('ip', 0); }
  assert.equal(l.isBlocked('ip', 500), true);
  assert.equal(l.isBlocked('other', 500), false);
  assert.equal(l.isBlocked('ip', 1001), false);
  l.fail('ip', 2000); l.reset('ip');
  assert.equal(l.isBlocked('ip', 2000), false);
});
