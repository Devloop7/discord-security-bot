// test/loggingConfig.test.js — pure gating/resolution for the logging system.
const { test } = require('node:test');
const assert = require('node:assert');
const { isEnabled, resolveChannelId, KEYS } = require('../src/logging/config');

test('isEnabled: off entirely when no master channel', () => {
  assert.strictEqual(isEnabled({ channelId: null, events: {} }, 'memberJoin'), false);
  assert.strictEqual(isEnabled(undefined, 'memberJoin'), false);
});

test('isEnabled: on by default once master channel is set', () => {
  const cfg = { channelId: '123', events: {} };
  assert.strictEqual(isEnabled(cfg, 'memberJoin'), true);
  assert.strictEqual(isEnabled(cfg, 'messageDelete'), true);
});

test('isEnabled: explicit false disables just that event', () => {
  const cfg = { channelId: '123', events: { messageDelete: false } };
  assert.strictEqual(isEnabled(cfg, 'messageDelete'), false);
  assert.strictEqual(isEnabled(cfg, 'messageEdit'), true);
});

test('resolveChannelId: override beats master, falls back to master', () => {
  const cfg = { channelId: 'master', channelOverrides: { voiceActivity: 'voicelog' } };
  assert.strictEqual(resolveChannelId(cfg, 'voiceActivity'), 'voicelog');
  assert.strictEqual(resolveChannelId(cfg, 'memberJoin'), 'master');
  assert.strictEqual(resolveChannelId({ channelId: null }, 'memberJoin'), null);
});

test('catalog has the expected core keys', () => {
  for (const k of ['messageDelete', 'memberBan', 'voiceActivity', 'emojiChange']) {
    assert.ok(KEYS.includes(k), `missing ${k}`);
  }
});
