const { test } = require('node:test');
const assert = require('node:assert');
const {
  PRIORITY, controlRows, closedRows, closeConfirmRow,
  addUserRow, removeUserRow, feedbackRows, panelComponents,
} = require('../src/tickets/constants');

test('PRIORITY scale exposes the premium emoji/label set', () => {
  assert.strictEqual(PRIORITY.high.emoji, '🟠');
  assert.strictEqual(PRIORITY.urgent.emoji, '🔴');
  assert.strictEqual(PRIORITY.low.label, 'Low');
});

test('controlRows: claimed shows an Unclaim button as the primary control', () => {
  const rows = controlRows({ claimed: true, enablePriority: true });
  assert.ok(Array.isArray(rows));
  const firstBtn = rows[0].toJSON().components[0];
  assert.strictEqual(firstBtn.custom_id, 'ticket_unclaim');
});

test('controlRows: unclaimed shows Claim, and includes the priority select', () => {
  const rows = controlRows({ claimed: false, enablePriority: true });
  assert.strictEqual(rows[0].toJSON().components[0].custom_id, 'ticket_claim');
  // Row 1 has Claim · Close · Transcript
  const ids = rows[0].toJSON().components.map((c) => c.custom_id);
  assert.deepStrictEqual(ids, ['ticket_claim', 'ticket_close', 'ticket_transcript']);
  // A priority select menu row exists.
  const select = rows[rows.length - 1].toJSON().components[0];
  assert.strictEqual(select.custom_id, 'ticket_priority_select');
});

test('controlRows: priority select can be turned off', () => {
  const rows = controlRows({ claimed: false, enablePriority: false });
  const hasSelect = rows.some((r) => r.toJSON().components.some((c) => c.custom_id === 'ticket_priority_select'));
  assert.strictEqual(hasSelect, false);
});

test('controlRows row 2 has Add User and Remove User', () => {
  const rows = controlRows({ claimed: false, enablePriority: true });
  const ids = rows[1].toJSON().components.map((c) => c.custom_id);
  assert.deepStrictEqual(ids, ['ticket_adduser', 'ticket_removeuser']);
});

test('closedRows exposes Reopen, Transcript and Delete', () => {
  const ids = closedRows()[0].toJSON().components.map((c) => c.custom_id);
  assert.deepStrictEqual(ids, ['ticket_reopen', 'ticket_transcript', 'ticket_delete']);
});

test('closeConfirmRow offers confirm, reason and cancel', () => {
  const ids = closeConfirmRow()[0].toJSON().components.map((c) => c.custom_id);
  assert.deepStrictEqual(ids, ['ticket_close_confirm', 'ticket_close_reason', 'ticket_close_cancel']);
});

test('add/remove user pickers expose user-select menus', () => {
  assert.strictEqual(addUserRow()[0].toJSON().components[0].custom_id, 'ticket_adduser_select');
  assert.strictEqual(removeUserRow()[0].toJSON().components[0].custom_id, 'ticket_removeuser_select');
});

test('feedbackRows produces 2 rows and first star has correct customId', () => {
  const rows = feedbackRows('g', 'c');
  assert.strictEqual(rows.length, 2);
  const firstBtn = rows[0].toJSON().components[0];
  assert.strictEqual(firstBtn.custom_id, 'ticket_feedback:g:c:1');
});

test('panelComponents returns a row array whose button is create_ticket', () => {
  const rows = panelComponents('Create Ticket');
  assert.ok(Array.isArray(rows));
  assert.strictEqual(rows[0].toJSON().components[0].custom_id, 'create_ticket');
});
