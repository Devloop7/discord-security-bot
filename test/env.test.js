const { test } = require('node:test');
const assert = require('node:assert');

process.env.DISCORD_TOKEN = 'tok';
process.env.CLIENT_ID = 'cid';
process.env.GUILD_ID = 'gid';
process.env.MULTI_GUILD = 'true';
const env = require('../src/core/env');

test('env reads TitanBot-style names', () => {
  assert.strictEqual(env.token, 'tok');
  assert.strictEqual(env.clientId, 'cid');
  assert.strictEqual(env.guildId, 'gid');
  assert.strictEqual(env.multiGuild, true);
});
