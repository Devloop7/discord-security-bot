const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
process.env.BOT_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'botperm-'));
const ts = require('../src/core/ticketStore');
const { isStaff, canManageTicket, canCloseTicket } = require('../src/tickets/permissions');
const { PermissionFlagsBits } = require('discord.js');

// Fake member helpers
function makeMember({ id = 'user1', hasManageChannels = false, roleIds = [] } = {}) {
  return {
    id,
    permissions: { has: (p) => hasManageChannels && p === PermissionFlagsBits.ManageChannels },
    roles: { cache: { has: (rid) => roleIds.includes(rid) } },
  };
}

test('isStaff: member with ManageChannels → true', () => {
  const member = makeMember({ hasManageChannels: true });
  assert.strictEqual(isStaff(member, 'gP'), true);
});

test('isStaff: member without ManageChannels but with configured staff role → true', () => {
  ts.setConfig('gP', { staffRoleId: 'staffRole' });
  const member = makeMember({ hasManageChannels: false, roleIds: ['staffRole'] });
  assert.strictEqual(isStaff(member, 'gP'), true);
});

test('isStaff: plain member with no permissions or role → false', () => {
  ts.setConfig('gP2', { staffRoleId: 'staffRole' });
  const member = makeMember({ hasManageChannels: false, roleIds: [] });
  assert.strictEqual(isStaff(member, 'gP2'), false);
});

test('isStaff: null member → false', () => {
  assert.strictEqual(isStaff(null, 'gP'), false);
});

test('canManageTicket mirrors isStaff', () => {
  const staffMember = makeMember({ hasManageChannels: true });
  const plainMember = makeMember({ hasManageChannels: false });
  assert.strictEqual(canManageTicket(staffMember, 'gP'), true);
  assert.strictEqual(canManageTicket(plainMember, 'gP'), false);
});

test('canCloseTicket: ticket opener can close even if not staff', () => {
  const opener = makeMember({ id: 'opener1', hasManageChannels: false, roleIds: [] });
  const ticket = { userId: 'opener1' };
  assert.strictEqual(canCloseTicket(opener, 'gP3', ticket), true);
});

test('canCloseTicket: non-opener non-staff cannot close', () => {
  const other = makeMember({ id: 'other99', hasManageChannels: false, roleIds: [] });
  const ticket = { userId: 'opener1' };
  assert.strictEqual(canCloseTicket(other, 'gP3', ticket), false);
});

test('canCloseTicket: staff can close any ticket', () => {
  const staff = makeMember({ id: 'staff1', hasManageChannels: true });
  const ticket = { userId: 'someoneElse' };
  assert.strictEqual(canCloseTicket(staff, 'gP3', ticket), true);
});
