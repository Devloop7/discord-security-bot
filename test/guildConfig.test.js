const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
process.env.BOT_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'botguild-'));
const gc = require('../src/core/guildConfig');

test('get returns defaults for unknown guild', () => {
  const cfg = gc.get('g1');
  assert.strictEqual(cfg.leveling.cooldownSec, 60);
  assert.strictEqual(cfg.modLogChannelId, null);
  assert.strictEqual(cfg.welcome.text, 'Welcome {user}!');
  assert.deepStrictEqual(cfg.staffRoleIds, []);
});

test('set patches guild config and preserves defaults', async () => {
  await gc.set('g1', { modLogChannelId: 'c1' });
  const cfg = gc.get('g1');
  assert.strictEqual(cfg.modLogChannelId, 'c1');
  assert.strictEqual(cfg.welcome.text, 'Welcome {user}!'); // default preserved
  assert.strictEqual(cfg.leveling.cooldownSec, 60);        // nested default preserved
});

test('set returns the updated guild config', async () => {
  const result = await gc.set('g2', { alertRoleId: 'r99' });
  assert.strictEqual(result.alertRoleId, 'r99');
  assert.strictEqual(result.modLogChannelId, null);
});

test('set deep-merges nested objects without dropping siblings', async () => {
  await gc.set('g3', { welcome: { enabled: true } });
  await gc.set('g3', { welcome: { channelId: 'wc' } });
  const cfg = gc.get('g3');
  assert.strictEqual(cfg.welcome.enabled, true);            // from first patch
  assert.strictEqual(cfg.welcome.channelId, 'wc');          // from second patch
  assert.strictEqual(cfg.welcome.text, 'Welcome {user}!');  // default sibling preserved
});
