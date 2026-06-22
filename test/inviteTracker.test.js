// test/inviteTracker.test.js — pure diff + persistence logic for invite tracking.
const { test } = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

process.env.BOT_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'botdata-inv-'));
const t = require('../src/invites/tracker');

test('findUsedInvite: detects the incremented code', () => {
  assert.strictEqual(t.findUsedInvite({ abc: 3, xyz: 1 }, { abc: 4, xyz: 1 }), 'abc');
  assert.strictEqual(t.findUsedInvite({ abc: 3 }, { abc: 3, NEW: 1 }), 'NEW'); // brand-new invite used
  assert.strictEqual(t.findUsedInvite({ abc: 3 }, { abc: 3 }), null);          // nothing changed (vanity/unknown)
  assert.strictEqual(t.findUsedInvite({}, {}), null);
});

test('recordJoin/getStats: real vs fake buckets', async () => {
  await t.recordJoin('g1', 'inv1', 'm1', false);
  await t.recordJoin('g1', 'inv1', 'm2', true);
  const s = t.getStats('g1', 'inv1');
  assert.strictEqual(s.real, 1);
  assert.strictEqual(s.fake, 1);
  assert.strictEqual(t.getInviter('g1', 'm1'), 'inv1');
});

test('recordLeave: decrements the right bucket and bumps left', async () => {
  await t.recordLeave('g1', 'm1'); // m1 was a real join
  const s = t.getStats('g1', 'inv1');
  assert.strictEqual(s.real, 0);
  assert.strictEqual(s.left, 1);
  assert.strictEqual(t.getInviter('g1', 'm1'), null); // mapping cleared
  // leaving an unknown member is a safe no-op
  assert.strictEqual(await t.recordLeave('g1', 'ghost'), null);
});

test('leaderboard: sorted by total (real+fake) desc', async () => {
  await t.recordJoin('g2', 'a', 'x1', false);
  await t.recordJoin('g2', 'a', 'x2', false);
  await t.recordJoin('g2', 'b', 'x3', false);
  const lb = t.leaderboard('g2');
  assert.strictEqual(lb[0].inviterId, 'a');
  assert.strictEqual(lb[0].total, 2);
  assert.strictEqual(lb[1].inviterId, 'b');
});
