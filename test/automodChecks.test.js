// test/automodChecks.test.js — pure content checks for the automod engine.
const { test } = require('node:test');
const assert = require('node:assert');
const {
  checkCaps, countEmoji, checkEmoji, checkMentions, checkRegex, checkNsfwLink, detectContent,
} = require('../src/protection/automodChecks');

test('checkCaps: only fires past minLength and percent', () => {
  assert.strictEqual(checkCaps('HELLO EVERYONE LOOK', { minLength: 10, percent: 70 }), true);
  assert.strictEqual(checkCaps('Hello everyone, how are you', { minLength: 10, percent: 70 }), false);
  assert.strictEqual(checkCaps('OK', { minLength: 10, percent: 70 }), false); // too short
  assert.strictEqual(checkCaps('123 456 !!!', { minLength: 1, percent: 50 }), false); // no letters
});

test('emoji counting covers unicode + custom', () => {
  assert.strictEqual(countEmoji('hi 😀😀 <:custom:123> <a:anim:456>'), 4);
  assert.strictEqual(checkEmoji('😀😀😀', { max: 5 }), false);
  assert.strictEqual(checkEmoji('😀😀😀😀😀😀', { max: 5 }), true);
});

test('checkMentions compares against max', () => {
  assert.strictEqual(checkMentions(6, { max: 5 }), true);
  assert.strictEqual(checkMentions(5, { max: 5 }), false);
});

test('checkRegex matches, ignores invalid/oversized, returns source', () => {
  assert.strictEqual(checkRegex('buy followers now', [{ source: 'buy \\w+ followers', flags: 'i' }]), null);
  assert.strictEqual(checkRegex('buy cheap followers', [{ source: 'buy \\w+ followers', flags: 'i' }]), 'buy \\w+ followers');
  assert.strictEqual(checkRegex('text', [{ source: '(((((((', flags: '' }]), null); // invalid regex skipped
  const huge = 'a'.repeat(500);
  assert.strictEqual(checkRegex('aaa', [{ source: huge, flags: '' }]), null); // oversized skipped
});

test('checkNsfwLink matches host + subdomains only', () => {
  const list = ['pornhub.com', 'onlyfans.com'];
  assert.strictEqual(checkNsfwLink('see https://pornhub.com/x', list), true);
  assert.strictEqual(checkNsfwLink('see https://www.onlyfans.com', list), true); // www. is a subdomain
  assert.strictEqual(checkNsfwLink('see https://notpornhub.com', list), false); // not a subdomain
  assert.strictEqual(checkNsfwLink('no links here', list), false);
});

test('detectContent runs only enabled checks, in priority order', () => {
  const cfg = {
    nsfwLinks: { enabled: true },
    regex: { enabled: true, patterns: [{ source: 'badword', flags: 'i' }] },
    mentions: { enabled: false, max: 5 },
    caps: { enabled: true, minLength: 5, percent: 60 },
    emoji: { enabled: false, max: 8 },
  };
  const nsfw = ['evil.xxx'];
  assert.strictEqual(detectContent({ content: 'clean text' }, cfg, nsfw), null);
  assert.strictEqual(detectContent({ content: 'a BADWORD here' }, cfg, nsfw).type, 'regex');
  assert.strictEqual(detectContent({ content: 'go to https://evil.xxx now' }, cfg, nsfw).type, 'nsfwLinks'); // nsfw beats others
  assert.strictEqual(detectContent({ content: 'SHOUTING LOUDLY' }, cfg, nsfw).type, 'caps');
  // disabled mentions never fires even when over the limit
  assert.strictEqual(detectContent({ content: 'hi', mentionCount: 99 }, cfg, nsfw), null);
});
