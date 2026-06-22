// test/reactionRoles.test.js — pure role-resolution logic for self-roles.
const { test } = require('node:test');
const assert = require('node:assert');
const { resolveButton, resolveSelect } = require('../src/reactionroles/store');

const group = (mode) => ({ mode, roles: [{ roleId: 'A' }, { roleId: 'B' }, { roleId: 'C' }] });

test('normal mode: button toggles a single role', () => {
  assert.deepStrictEqual(resolveButton(group('normal'), 'A', false), { add: ['A'], remove: [] });
  assert.deepStrictEqual(resolveButton(group('normal'), 'A', true), { add: [], remove: ['A'] });
});

test('unique mode: picking one role removes the others; re-click removes it', () => {
  assert.deepStrictEqual(resolveButton(group('unique'), 'A', false), { add: ['A'], remove: ['B', 'C'] });
  assert.deepStrictEqual(resolveButton(group('unique'), 'A', true), { add: [], remove: ['A'] });
});

test('verify mode: one-way grant, never removes', () => {
  assert.deepStrictEqual(resolveButton(group('verify'), 'A', false), { add: ['A'], remove: [] });
  assert.deepStrictEqual(resolveButton(group('verify'), 'A', true), { add: [], remove: [] });
});

test('select: member ends with exactly the selected group roles', () => {
  // member currently has A and C; selects A and B -> add B, remove C.
  const r = resolveSelect(group('normal'), ['A', 'B'], ['A', 'C', 'Z']);
  assert.deepStrictEqual(r.add, ['B']);
  assert.deepStrictEqual(r.remove, ['C']);
});

test('select: ignores roleIds outside the group and leaves foreign member roles alone', () => {
  const r = resolveSelect(group('normal'), ['A', 'X'], ['B', 'Z']);
  assert.deepStrictEqual(r.add, ['A']);
  assert.deepStrictEqual(r.remove, ['B']); // Z is not in the group → untouched
});

test('select: empty selection clears all group roles the member had', () => {
  const r = resolveSelect(group('unique'), [], ['A', 'B']);
  assert.deepStrictEqual(r.add, []);
  assert.deepStrictEqual(r.remove.sort(), ['A', 'B']);
});
