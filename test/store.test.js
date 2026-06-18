// test/store.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Point the store at a throwaway temp dir BEFORE requiring it.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'botstore-'));
process.env.BOT_DATA_DIR = tmp;
const store = require('../src/core/store');

test('read returns fallback when file is missing', () => {
  assert.deepStrictEqual(store.read('missing.json', { a: 1 }), { a: 1 });
});

test('write then read round-trips data', () => {
  store.write('x.json', { hello: 'world', n: 2 });
  assert.deepStrictEqual(store.read('x.json'), { hello: 'world', n: 2 });
});
