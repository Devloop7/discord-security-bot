// test/vouchStore.test.js — shop-review store: monotonic IDs, per-member cooldown,
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
const DAY = 86400000;

test('avgOf / distOf are pure and correct', () => {
  const list = [{ rating: 5 }, { rating: 4 }, { rating: 5 }];
  assert.strictEqual(v.avgOf(list), 4.7);
  assert.deepStrictEqual(v.distOf(list), { 1: 0, 2: 0, 3: 0, 4: 1, 5: 2 });
  assert.strictEqual(v.avgOf([]), 0);
});

test('addReview assigns monotonic Vouch IDs and validates rating', async () => {
  const r1 = await v.addReview(G, 'alice', { rating: 5, comment: 'great' });
  assert.deepStrictEqual([r1.ok, r1.id, r1.count, r1.average], [true, 1, 1, 5]);
  const r2 = await v.addReview(G, 'bob', { rating: 4 });
  assert.strictEqual(r2.id, 2);
  // with no cooldown (default 0), the same member may vouch again
  const r3 = await v.addReview(G, 'alice', { rating: 3 });
  assert.ok(r3.ok && r3.id === 3);
  assert.ok((await v.addReview(G, 'carol', { rating: 6 })).error); // bad rating
  assert.strictEqual(v.count(G), 3);
});

test('cooldown blocks a member within the window, allows after it', async () => {
  const g = 'g-cd';
  const t0 = 1_700_000_000_000;
  assert.ok((await v.addReview(g, 'amy', { rating: 5 }, 3 * DAY, t0)).ok);
  const blocked = await v.addReview(g, 'amy', { rating: 4 }, 3 * DAY, t0 + DAY); // 1 day later
  assert.strictEqual(blocked.error, 'cooldown');
  assert.strictEqual(blocked.retryAt, t0 + 3 * DAY);
  assert.ok((await v.addReview(g, 'amy', { rating: 5 }, 3 * DAY, t0 + 3 * DAY)).ok); // exactly 3 days later
  assert.strictEqual(v.count(g), 2);
});

test('cooldownRemaining computes time left (0 when elapsed or disabled)', () => {
  const last = v.lastReviewTs('g-cd', 'amy'); // = t0 + 3d from the previous test
  assert.strictEqual(v.cooldownRemaining('g-cd', 'amy', 3 * DAY, last + DAY), 2 * DAY);
  assert.strictEqual(v.cooldownRemaining('g-cd', 'amy', 3 * DAY, last + 3 * DAY), 0);
  assert.strictEqual(v.cooldownRemaining('g-cd', 'amy', 0, last + DAY), 0); // disabled
  assert.strictEqual(v.cooldownRemaining('g-cd', 'never', 3 * DAY, last), 0); // never reviewed
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
  await v.addReview('g2', 'x', { rating: 3, comment: 'first' }, 0, 1000);
  await v.addReview('g2', 'y', { rating: 5, comment: 'second' }, 0, 2000);
  const s = v.stats('g2');
  assert.deepStrictEqual([s.count, s.average], [2, 4]);
  assert.strictEqual(v.recent('g2', 5)[0].comment, 'second');
});

test('legacy array shape is read + migrated on write', async () => {
  const gl = 'g-legacy';
  coreStore.write(v.FILE, { ...coreStore.read(v.FILE, {}), [gl]: [{ from: 'old', rating: 5, comment: 'legacy', ts: 1 }] });
  assert.strictEqual(v.count(gl), 1);
  assert.strictEqual(v.average(gl), 5);
  const r = await v.addReview(gl, 'new', { rating: 4 }); // migrates + continues the seq
  assert.strictEqual(r.id, 2);
  assert.strictEqual(v.count(gl), 2);
});
