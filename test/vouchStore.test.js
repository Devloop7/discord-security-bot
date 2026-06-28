// test/vouchStore.test.js — vouch persistence + one-per-person + leaderboard.
const { test } = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

process.env.BOT_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'botdata-vouch-'));
const v = require('../src/vouch/store');

const G = 'g1';

test('addVouch records and counts; one vouch per giver per target', async () => {
  const r1 = await v.addVouch(G, 'alice', 'bob', 'great trader');
  assert.deepStrictEqual([r1.ok, r1.count], [true, 1]);
  const r2 = await v.addVouch(G, 'carol', 'bob', 'fast');
  assert.strictEqual(r2.count, 2);
  // alice can't vouch bob again
  const dup = await v.addVouch(G, 'alice', 'bob', 'again');
  assert.ok(dup.error);
  assert.strictEqual(v.countFor(G, 'bob'), 2);
  assert.strictEqual(v.hasVouched(G, 'alice', 'bob'), true);
  assert.strictEqual(v.hasVouched(G, 'dave', 'bob'), false);
});

test('recentFor returns newest first with comments', async () => {
  await v.addVouch(G, 'x', 'target', 'first', 1000);
  await v.addVouch(G, 'y', 'target', 'second', 2000);
  const recent = v.recentFor(G, 'target', 5);
  assert.strictEqual(recent[0].comment, 'second');
  assert.strictEqual(recent[1].comment, 'first');
});

test('leaderboard ranks targets by count desc', async () => {
  await v.addVouch(G, 'a', 'pop', 'c1');
  await v.addVouch(G, 'b', 'pop', 'c2');
  await v.addVouch(G, 'c', 'pop', 'c3');
  const lb = v.leaderboard(G, 10);
  assert.strictEqual(lb[0].targetId, 'pop');
  assert.strictEqual(lb[0].count, 3);
});

test('removeVouch deletes a specific giver vouch (staff anti-abuse)', async () => {
  await v.addVouch(G, 'faker', 'victim', 'fake');
  assert.strictEqual(v.countFor(G, 'victim'), 1);
  const rm = await v.removeVouch(G, 'faker', 'victim');
  assert.deepStrictEqual([rm.removed, rm.count], [true, 0]);
  assert.strictEqual(v.countFor(G, 'victim'), 0);
  // removing a non-existent vouch is a safe no-op
  const noop = await v.removeVouch(G, 'ghost', 'victim');
  assert.strictEqual(noop.removed, false);
});
