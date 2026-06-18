// test/escalate.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { parseDuration, nextTimeout } = require('../src/core/escalate');

test('parseDuration handles m/h/d', () => {
  assert.strictEqual(parseDuration('5m'), 5 * 60_000);
  assert.strictEqual(parseDuration('1h'), 60 * 60_000);
  assert.strictEqual(parseDuration('1d'), 24 * 60 * 60_000);
});

test('parseDuration returns 0 for bad input', () => {
  assert.strictEqual(parseDuration('nonsense'), 0);
});

test('nextTimeout escalates and caps at the last step', () => {
  const steps = ['5m', '1h', '1d'];
  assert.strictEqual(nextTimeout(1, steps), 5 * 60_000);
  assert.strictEqual(nextTimeout(2, steps), 60 * 60_000);
  assert.strictEqual(nextTimeout(3, steps), 24 * 60 * 60_000);
  assert.strictEqual(nextTimeout(9, steps), 24 * 60 * 60_000); // capped
});
