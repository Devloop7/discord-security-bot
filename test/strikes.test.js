// test/strikes.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.BOT_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'botstrk-'));
const strikes = require('../src/core/strikes');

test('add increments and returns the new count per type', () => {
  assert.strictEqual(strikes.add('user1', 'link'), 1);
  assert.strictEqual(strikes.add('user1', 'link'), 2);
  assert.strictEqual(strikes.add('user1', 'profanity'), 1);
});

test('get returns current counts; reset clears them', () => {
  assert.deepStrictEqual(strikes.get('user1'), { link: 2, profanity: 1 });
  strikes.reset('user1');
  assert.deepStrictEqual(strikes.get('user1'), { link: 0, profanity: 0 });
});

test('add with decayMs=0 never decays — two adds yield 2', () => {
  assert.strictEqual(strikes.add('ud2', 'link', 0), 1);
  assert.strictEqual(strikes.add('ud2', 'link', 0), 2);
  assert.deepStrictEqual(strikes.get('ud2'), { link: 2, profanity: 0 });
});

test('add with a huge decayMs does not decay within the same test run', () => {
  // 10_000_000 ms ≈ 2.7 hours — well beyond any test duration
  assert.strictEqual(strikes.add('ud3', 'link', 10_000_000), 1);
  assert.strictEqual(strikes.add('ud3', 'link', 10_000_000), 2);
  assert.deepStrictEqual(strikes.get('ud3'), { link: 2, profanity: 0 });
});

test('get with decayMs=0 always returns actual stored counts', () => {
  // user1 was reset above; fresh user
  strikes.add('ud4', 'profanity');
  strikes.add('ud4', 'profanity');
  assert.deepStrictEqual(strikes.get('ud4', 0), { link: 0, profanity: 2 });
});

test('get with a huge decayMs does not treat recent strikes as expired', () => {
  assert.deepStrictEqual(strikes.get('ud3', 10_000_000), { link: 2, profanity: 0 });
});
