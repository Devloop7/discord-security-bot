// test/linkscan.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { hasLink, domainsOf, isInvite, isScam } = require('../src/protection/linkscan');

test('hasLink detects urls and bare domains', () => {
  assert.strictEqual(hasLink('check https://youtube.com/watch'), true);
  assert.strictEqual(hasLink('go to example.com please'), true);
  assert.strictEqual(hasLink('no links here at all'), false);
});

test('domainsOf extracts lowercased hostnames without www', () => {
  assert.deepStrictEqual(domainsOf('visit https://www.YouTube.com/x'), ['youtube.com']);
});

test('isInvite detects discord invites', () => {
  assert.strictEqual(isInvite('join discord.gg/abcd'), true);
  assert.strictEqual(isInvite('https://discord.com/invite/xyz'), true);
  assert.strictEqual(isInvite('just chatting'), false);
});

test('isScam matches the blocklist', () => {
  assert.strictEqual(isScam(['grabify.link'], ['grabify.link', 'iplogger.org']), true);
  assert.strictEqual(isScam(['youtube.com'], ['grabify.link']), false);
});
