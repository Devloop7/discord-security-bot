const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
process.env.BOT_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'botsched-'));
const scheduler = require('../src/core/scheduler');

test('due jobs run on init and are removed; future jobs persist', async () => {
  const fired = [];
  scheduler.register('t', async (data) => { fired.push(data.v); });
  scheduler.schedule('t', Date.now() - 1000, { v: 1 }); // past → should fire on init
  scheduler.schedule('t', Date.now() + 1_000_000, { v: 2 }); // future → should remain
  await scheduler.init({});
  assert.deepStrictEqual(fired, [1]);
  const remaining = scheduler.jobs();
  assert.strictEqual(remaining.length, 1);
  assert.strictEqual(remaining[0].data.v, 2);
});

test('hasJob finds a scheduled job by type/predicate', () => {
  assert.strictEqual(scheduler.hasJob('t', (d) => d.v === 2), true);
  assert.strictEqual(scheduler.hasJob('t', (d) => d.v === 999), false);
});
