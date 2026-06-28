// test/vouchStore.test.js — shop-review store: one-per-person, monotonic IDs,
// average, distribution, recent, remove, and legacy-array migration.
const { test } = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

process.env.BOT_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'botdata-rev-'));
const coreStore = require('../src/core/store');
const v = require('../src/vouch/store');

const G = 'g1';

test('avgOf / distOf are pure and correct', () => {
  const list = [{ rating: 5 }, { rating: 4 }, { rating: 5 }];
  assert.strictEqual(v.avgOf(list), 4.7);
  assert.deepStrictEqual(v.distOf(list), { 1: 0, 2: 0, 3: 0, 4: 1, 5: 2 });
  assert.strictEqual(v.avgOf([]), 0);
});

test('addReview assigns monotonic Vouch IDs, enforces one-per-person + valid rating', async () => {
  const r1 = await v.addReview(G, 'alice', { rating: 5, comment: 'great', proof: null });
  assert.deepStrictEqual([r1.ok, r1.id, r1.count, r1.average], [true, 1, 1, 5]);
  const r2 = await v.addReview(G, 'bob', { rating: 4, comment: 'good' });
  assert.strictEqual(r2.id, 2);
  assert.strictEqual(r2.average, 4.5);
  const dup = await v.addReview(G, 'alice', { rating: 1 });
  assert.ok(dup.error);
  assert.ok((await v.addReview(G, 'carol', { rating: 6 })).error);
  assert.strictEqual(v.count(G), 2);
  assert.strictEqual(v.hasReviewed(G, 'alice'), true);
});

test('IDs stay monotonic across a removal (no recycling)', async () => {
  const gg = 'g-mono';
  await v.addReview(gg, 'a', { rating: 5 });        // id 1
  await v.addReview(gg, 'b', { rating: 5 });        // id 2
  await v.removeReview(gg, 'a');                     // remove id 1
  const r = await v.addReview(gg, 'c', { rating: 5 }); // must be id 3, not 2
  assert.strictEqual(r.id, 3);
});

test('stats + recent', async () => {
  const s = v.stats(G);
  assert.deepStrictEqual([s.count, s.average], [2, 4.5]);
  await v.addReview('g2', 'x', { rating: 3, comment: 'first' }, 1000);
  await v.addReview('g2', 'y', { rating: 5, comment: 'second' }, 2000);
  assert.strictEqual(v.recent('g2', 5)[0].comment, 'second');
});

test('legacy array shape is read + migrated on write', async () => {
  const gl = 'g-legacy';
  // Simulate the pre-ID shape: a bare array of reviews.
  coreStore.write(v.FILE, { ...coreStore.read(v.FILE, {}), [gl]: [{ from: 'old', rating: 5, comment: 'legacy', ts: 1 }] });
  assert.strictEqual(v.count(gl), 1);             // read transparently
  assert.strictEqual(v.average(gl), 5);
  const r = await v.addReview(gl, 'new', { rating: 4 }); // migrates + continues the seq
  assert.strictEqual(r.id, 2);                    // seq started at the legacy length (1)
  assert.strictEqual(v.count(gl), 2);
});
