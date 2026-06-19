// test/whitelist.test.js
const { test } = require('node:test');
const assert = require('node:assert');
process.env.OWNER_IDS = 'env-owner-id';

// Stub config before requiring the module under test.
const Module = require('node:module');
const origResolve = Module._resolveFilename;
const configStub = {
  trustedUsers: ['owner-bypass-id'],
  link: { allowedRoles: ['mod-role'], allowedChannels: ['link-channel'], allowedDomains: [] },
};
require.cache[require.resolve('../config')] = { id: 'cfg', exports: configStub, loaded: true };
const { isTrusted, canPostLinks } = require('../src/core/whitelist');

const fakeMember = (id, ownerId, roleIds = []) => ({
  id,
  guild: { ownerId },
  roles: { cache: { some: (fn) => roleIds.map((rid) => ({ id: rid })).some(fn) } },
});

test('isTrusted: owner and listed users are trusted, others are not', () => {
  assert.strictEqual(isTrusted(fakeMember('x', 'x')), true);          // owner
  assert.strictEqual(isTrusted(fakeMember('owner-bypass-id', 'z')), true); // listed
  assert.strictEqual(isTrusted(fakeMember('rando', 'z')), false);     // admin but not listed
});

test('canPostLinks: allowed role or allowed channel passes', () => {
  assert.strictEqual(canPostLinks(fakeMember('a', 'z', ['mod-role']), 'any'), true);
  assert.strictEqual(canPostLinks(fakeMember('a', 'z', []), 'link-channel'), true);
  assert.strictEqual(canPostLinks(fakeMember('a', 'z', []), 'normal'), false);
});

test('canPostLinks: null member is not allowed (secure default)', () => {
  assert.strictEqual(canPostLinks(null, 'normal'), false);
  assert.strictEqual(canPostLinks(null, 'link-channel'), true); // allowed channel still bypasses
});

test('isTrusted: OWNER_IDS env users are trusted', () => {
  assert.strictEqual(isTrusted(fakeMember('env-owner-id', 'someone-else')), true);
});
