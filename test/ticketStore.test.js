const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
process.env.BOT_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'botticket-'));
const ts = require('../src/core/ticketStore');

test('config: defaults then set/merge per guild', () => {
  const def = ts.getConfig('g1');
  assert.strictEqual(def.maxTicketsPerUser, 3);
  assert.strictEqual(def.dmOnClose, true);
  assert.strictEqual(def.enablePriority, true);
  assert.strictEqual(def.counter, 0);
  ts.setConfig('g1', { staffRoleId: 'r1', maxTicketsPerUser: 5 });
  const c = ts.getConfig('g1');
  assert.strictEqual(c.staffRoleId, 'r1');
  assert.strictEqual(c.maxTicketsPerUser, 5);
  assert.strictEqual(c.dmOnClose, true); // unchanged default preserved
});

test('counter increments and pads to 3 digits', () => {
  assert.strictEqual(ts.nextCounter('g2'), '001');
  assert.strictEqual(ts.nextCounter('g2'), '002');
  assert.strictEqual(ts.getConfig('g2').counter, 2);
});

test('ticket records: create/get/update; open-count per user', () => {
  ts.createTicket('chA', { userId: 'u1', guildId: 'g3', reason: 'help', priority: 'none' });
  ts.createTicket('chB', { userId: 'u1', guildId: 'g3', reason: 'x', priority: 'none' });
  ts.createTicket('chC', { userId: 'u2', guildId: 'g3', reason: 'y', priority: 'none' });
  assert.strictEqual(ts.getTicket('chA').status, 'open');
  assert.strictEqual(ts.openCount('g3', 'u1'), 2);
  ts.updateTicket('chA', { status: 'closed', closedBy: 'm1' });
  assert.strictEqual(ts.getTicket('chA').status, 'closed');
  assert.strictEqual(ts.openCount('g3', 'u1'), 1);
});

test('deleteTicketRecord and clearGuild', () => {
  ts.deleteTicketRecord('chB');
  assert.strictEqual(ts.getTicket('chB'), null);
  ts.clearGuild('g3');
  assert.strictEqual(ts.getTicket('chC'), null);
});
