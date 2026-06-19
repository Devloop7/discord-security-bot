// src/core/env.js — resolves runtime token/IDs. Accepts TitanBot-style names
// (DISCORD_TOKEN/CLIENT_ID/GUILD_ID) and falls back to the original names so
// existing setups keep working. Must be required AFTER dotenv.config() has run.
const config = require('../../config');

const truthy = (v) => ['1', 'true', 'yes', 'on'].includes(String(v || '').toLowerCase());

module.exports = {
  token: process.env.DISCORD_TOKEN || process.env.BOT_TOKEN || '',
  clientId: process.env.CLIENT_ID || process.env.APP_ID || '',
  guildId: process.env.GUILD_ID || config.guildId || '',
  multiGuild: truthy(process.env.MULTI_GUILD),
};
