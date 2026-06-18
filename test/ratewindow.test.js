// test/ratewindow.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const RateWindow = require('../src/core/ratewindow');

test('counts events within the window per key', () => {
  const rw = new RateWindow(1000); // 1 second window
  assert.strictEqual(rw.record('u1', 0), 1);
  assert.strictEqual(rw.record('u1', 200), 2);
  assert.strictEqual(rw.record('u1', 400), 3);
});

test('drops events older than the window', () => {
  const rw = new RateWindow(1000);
  rw.record('u1', 0);
  rw.record('u1', 500);
  assert.strictEqual(rw.record('u1', 1600), 1); // first two expired
});

test('keys are independent', () => {
  const rw = new RateWindow(1000);
  rw.record('a', 0);
  assert.strictEqual(rw.record('b', 0), 1);
});
