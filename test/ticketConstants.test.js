const { test } = require('node:test');
const assert = require('node:assert');
const { PRIORITY, controlRow, feedbackRows, panelComponents } = require('../src/tickets/constants');

test('PRIORITY.high.emoji is 🔴', () => {
  assert.strictEqual(PRIORITY.high.emoji, '🔴');
});

test('controlRow({ claimed: true }) first button is disabled', () => {
  const row = controlRow({ claimed: true });
  const json = row.toJSON();
  assert.strictEqual(json.components[0].disabled, true);
});

test('feedbackRows produces 2 rows and first star has correct customId', () => {
  const rows = feedbackRows('g', 'c');
  assert.strictEqual(rows.length, 2);
  const firstBtn = rows[0].toJSON().components[0];
  assert.strictEqual(firstBtn.custom_id, 'ticket_feedback:g:c:1');
});

test('panelComponents first button customId is create_ticket', () => {
  const row = panelComponents('Create Ticket');
  const json = row.toJSON();
  assert.strictEqual(json.components[0].custom_id, 'create_ticket');
});
