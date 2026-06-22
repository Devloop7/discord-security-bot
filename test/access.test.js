// test/access.test.js — unified command authorization layering.
const { test } = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

process.env.BOT_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'botdata-acc-'));
const guildConfig = require('../src/core/guildConfig');
const { canRun } = require('../src/core/access');

// Build a fake member. roleIds → role cache; manageGuild → permissions.has; owner → matches guild.ownerId.
function member({ id = 'u1', roleIds = [], manageGuild = false, owner = false } = {}) {
  return {
    id,
    guild: { ownerId: owner ? id : 'owner-x' },
    roles: { cache: new Map(roleIds.map((r) => [r, {}])) },
    permissions: { has: () => manageGuild },
  };
}

test('owner is always allowed, even for disabled commands', async () => {
  const g = 'g-owner';
  await guildConfig.set(g, { permissions: { commandOverrides: { ban: { disabled: true } } } });
  assert.strictEqual(canRun(member({ owner: true }), 'ban', g).ok, true);
});

test('default mod gate: ManageGuild passes, plain member is blocked', () => {
  const g = 'g-default';
  assert.strictEqual(canRun(member({ manageGuild: true }), 'kick', g).ok, true);
  assert.strictEqual(canRun(member({}), 'kick', g).ok, false);
});

test('public (bypassModGate) command allowed for plain members', () => {
  assert.strictEqual(canRun(member({}), 'userinfo', 'g-pub', { bypassModGate: true }).ok, true);
});

test('disabled blocks non-owners even for public commands', async () => {
  const g = 'g-disabled';
  await guildConfig.set(g, { permissions: { commandOverrides: { poll: { disabled: true } } } });
  assert.strictEqual(canRun(member({}), 'poll', g, { bypassModGate: true }).ok, false);
});

test('staffLevels role grants access to mod commands', async () => {
  const g = 'g-staff';
  await guildConfig.set(g, { permissions: { staffLevels: { mod: ['modRole'], admin: [] } } });
  assert.strictEqual(canRun(member({ roleIds: ['modRole'] }), 'kick', g).ok, true);
  assert.strictEqual(canRun(member({ roleIds: ['other'] }), 'kick', g).ok, false);
});

test('per-command allow grants a non-staff role; deny overrides staff', async () => {
  const g = 'g-overrides';
  await guildConfig.set(g, {
    permissions: {
      commandOverrides: { warn: { allowedRoleIds: ['helper'] }, mute: { deniedRoleIds: ['probation'] } },
      staffLevels: { mod: ['modRole'], admin: [] },
    },
  });
  // helper isn't staff but is explicitly allowed for /warn
  assert.strictEqual(canRun(member({ roleIds: ['helper'] }), 'warn', g).ok, true);
  // a mod with the probation role is explicitly denied /mute (deny beats staff)
  assert.strictEqual(canRun(member({ roleIds: ['modRole', 'probation'] }), 'mute', g).ok, false);
});

test('missing member is denied', () => {
  assert.strictEqual(canRun(null, 'kick', 'g-x').ok, false);
});
