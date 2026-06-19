const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
process.env.BOT_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'botcase-'));
const cases = require('../src/core/cases');

test('add assigns incrementing ids and stores fields', () => {
  const a = cases.add('u1', { type: 'warn', modId: 'm1', reason: 'spam' });
  const b = cases.add('u1', { type: 'note', modId: 'm1', reason: 'watch this user' });
  assert.strictEqual(a.id, 1);
  assert.strictEqual(b.id, 2);
  assert.strictEqual(a.type, 'warn');
  assert.strictEqual(a.reason, 'spam');
  assert.ok(typeof a.ts === 'number');
});

test('list and warnings filter correctly', () => {
  assert.strictEqual(cases.list('u1').length, 2);
  assert.strictEqual(cases.warnings('u1').length, 1);
  assert.strictEqual(cases.warnings('u1')[0].type, 'warn');
});

test('add defaults reason when missing', () => {
  const c = cases.add('u2', { type: 'warn', modId: 'm1' });
  assert.strictEqual(c.reason, 'No reason given');
});

test('remove deletes a single case by id; clear wipes a user', () => {
  assert.strictEqual(cases.remove(1), true);
  assert.strictEqual(cases.warnings('u1').length, 0);
  assert.strictEqual(cases.list('u1').length, 1);
  const n = cases.clear('u1');
  assert.strictEqual(n, 1);
  assert.strictEqual(cases.list('u1').length, 0);
});
