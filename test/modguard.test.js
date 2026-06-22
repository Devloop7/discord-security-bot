// test/modguard.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { checkActable } = require('../src/core/modguard');

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeInteraction({ userId = 'user1', isOwner = false, invokerPos = 5 } = {}) {
  const ownerId = isOwner ? userId : 'owner999';
  return {
    user: { id: userId },
    member: { roles: { highest: { comparePositionTo: (o) => invokerPos - (o._pos ?? 0) } } },
    guild: {
      ownerId,
      members: {
        me: {
          id: 'bot123',
          roles: { highest: { comparePositionTo: (o) => 10 - (o._pos ?? 0) } },
        },
      },
    },
  };
}

function makeTarget({ id = 'target1', tag = 'Target#0001', pos = 3 } = {}) {
  const highest = { _pos: pos, comparePositionTo: (o) => pos - (o._pos ?? 0) };
  return { id, user: { tag }, roles: { highest } };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test('null target → blocked with "not in this server"', () => {
  const interaction = makeInteraction();
  const result = checkActable({ interaction, target: null, action: 'ban' });
  assert.strictEqual(result.ok, false);
  assert.match(result.reason, /isn't in this server/);
});

test('self-target → blocked', () => {
  const interaction = makeInteraction({ userId: 'user1' });
  const target = makeTarget({ id: 'user1' });
  const result = checkActable({ interaction, target, action: 'ban' });
  assert.strictEqual(result.ok, false);
  assert.match(result.reason, /yourself/);
});

test('target is server owner → blocked', () => {
  const interaction = makeInteraction({ userId: 'user1' });
  // owner999 is the ownerId set by makeInteraction when isOwner=false
  const target = makeTarget({ id: 'owner999' });
  const result = checkActable({ interaction, target, action: 'kick' });
  assert.strictEqual(result.ok, false);
  assert.match(result.reason, /server owner/);
});

test('target is the bot itself → blocked', () => {
  const interaction = makeInteraction();
  const target = makeTarget({ id: 'bot123' });
  const result = checkActable({ interaction, target, action: 'mute' });
  assert.strictEqual(result.ok, false);
  assert.match(result.reason, /myself/);
});

test('bot role too low → blocked', () => {
  // bot highest comparePositionTo returns 10 - pos; target pos=15 → 10-15 = -5 ≤ 0
  const interaction = makeInteraction();
  const target = makeTarget({ id: 'target1', pos: 15 });
  const result = checkActable({ interaction, target, action: 'ban' });
  assert.strictEqual(result.ok, false);
  assert.match(result.reason, /My role isn't high enough/);
});

test('invoker role too low (non-owner) → blocked', () => {
  // bot pos 10 > target pos 4 (ok), but invoker pos 3 < target pos 4 → blocked
  // invokerPos=3, targetPos=4: invokerPos - targetPos = -1 ≤ 0
  const interaction = makeInteraction({ userId: 'user1', invokerPos: 3 });
  const target = makeTarget({ id: 'target1', pos: 4 });
  const result = checkActable({ interaction, target, action: 'kick' });
  assert.strictEqual(result.ok, false);
  assert.match(result.reason, /top role is equal to or higher/);
});

test('valid case → ok', () => {
  // bot pos 10 > target pos 3 (ok), invoker pos 5 > target pos 3 (ok)
  const interaction = makeInteraction({ userId: 'user1', invokerPos: 5 });
  const target = makeTarget({ id: 'target1', pos: 3 });
  const result = checkActable({ interaction, target, action: 'ban' });
  assert.strictEqual(result.ok, true);
});

test('invoker is guild owner → hierarchy check skipped', () => {
  // invokerPos=1 which would normally be blocked vs target pos=3, but invoker IS owner
  const interaction = makeInteraction({ userId: 'owner999', isOwner: true, invokerPos: 1 });
  const target = makeTarget({ id: 'target1', pos: 3 });
  const result = checkActable({ interaction, target, action: 'ban' });
  assert.strictEqual(result.ok, true);
});
