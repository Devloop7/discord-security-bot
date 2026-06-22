// test/duration.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { parseDuration } = require('../src/core/duration');

test('parseDuration handles m/h/d/w', () => {
  assert.strictEqual(parseDuration('30m'), 30 * 60_000);
  assert.strictEqual(parseDuration('2h'), 2 * 3_600_000);
  assert.strictEqual(parseDuration('3d'), 3 * 86_400_000);
  assert.strictEqual(parseDuration('1w'), 604_800_000);
});

test('parseDuration is case-insensitive and trims/optional space', () => {
  assert.strictEqual(parseDuration(' 1H '), 3_600_000);
  assert.strictEqual(parseDuration('2 D'), 2 * 86_400_000);
});

test('parseDuration returns 0 for invalid/empty input', () => {
  assert.strictEqual(parseDuration('nonsense'), 0);
  assert.strictEqual(parseDuration('10'), 0);
  assert.strictEqual(parseDuration('1y'), 0);
  assert.strictEqual(parseDuration(''), 0);
  assert.strictEqual(parseDuration(null), 0);
  assert.strictEqual(parseDuration(undefined), 0);
});
