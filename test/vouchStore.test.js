// test/vouchStore.test.js — shop-review store: one-per-person, average, distribution, recent, remove.
const { test } = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

process.env.BOT_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'botdata-rev-'));
const v = require('../src/vouch/store');

const G = 'g1';

test('avgOf / distOf are pure and correct', () => {
  const list = [{ rating: 5 }, { rating: 4 }, { rating: 5 }];
  assert.strictEqual(v.avgOf(list), 4.7);
  assert.deepStrictEqual(v.distOf(list), { 1: 0, 2: 0, 3: 0, 4: 1, 5: 2 });
  assert.strictEqual(v.avgOf([]), 0);
});

test('addReview records, enforces one-per-person, validates rating', async () => {
  const r1 = await v.addReview(G, 'alice', { rating: 5, comment: 'great', proof: null });
  assert.deepStrictEqual([r1.ok, r1.count, r1.average], [true, 1, 5]);
  const r2 = await v.addReview(G, 'bob', { rating: 4, comment: 'good' });
  assert.strictEqual(r2.average, 4.5);
  // alice can't review twice
  const dup = await v.addReview(G, 'alice', { rating: 1 });
  assert.ok(dup.error);
  // bad ratings rejected
  assert.ok((await v.addReview(G, 'carol', { rating: 6 })).error);
  assert.ok((await v.addReview(G, 'dave', { rating: 0 })).error);
  assert.strictEqual(v.count(G), 2);
  assert.strictEqual(v.hasReviewed(G, 'alice'), true);
  assert.strictEqual(v.hasReviewed(G, 'zzz'), false);
});

test('stats returns count, average, distribution', () => {
  const s = v.stats(G);
  assert.strictEqual(s.count, 2);
  assert.strictEqual(s.average, 4.5);
  assert.deepStrictEqual(s.distribution, { 1: 0, 2: 0, 3: 0, 4: 1, 5: 1 });
});

test('recent is newest-first', async () => {
  await v.addReview('g2', 'x', { rating: 3, comment: 'first' }, 1000);
  await v.addReview('g2', 'y', { rating: 5, comment: 'second' }, 2000);
  const rec = v.recent('g2', 5);
  assert.strictEqual(rec[0].comment, 'second');
  assert.strictEqual(rec[1].comment, 'first');
});

test('removeReview deletes a member review (staff anti-abuse)', async () => {
  await v.addReview('g3', 'faker', { rating: 5, comment: 'fake' });
  assert.strictEqual(v.count('g3'), 1);
  const rm = await v.removeReview('g3', 'faker');
  assert.deepStrictEqual([rm.removed, rm.count], [true, 0]);
  assert.strictEqual((await v.removeReview('g3', 'ghost')).removed, false);
});
