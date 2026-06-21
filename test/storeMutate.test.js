const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
process.env.BOT_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'botmut-'));
const store = require('../src/core/store');

test('concurrent mutate calls do not lose updates', async () => {
  await Promise.all(
    Array.from({ length: 50 }, () => store.mutate('counter.json', (d) => { d.n = (d.n || 0) + 1; })),
  );
  assert.strictEqual(store.read('counter.json').n, 50);
});

test('mutate returns the callback return value', async () => {
  const r = await store.mutate('counter.json', (d) => { d.n += 1; return d.n; });
  assert.strictEqual(r, 51);
});
