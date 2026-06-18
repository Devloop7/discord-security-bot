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
