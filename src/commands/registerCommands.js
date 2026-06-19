// src/commands/registerCommands.js
// Registers all slash commands with Discord. Shared by the `npm run register`
// CLI and the bot's automatic registration on startup (so hosts like Railway,
// which only run `npm start`, still get commands registered).
const { REST, Routes } = require('discord.js');
const env = require('../core/env');
const { commandModules } = require('./index');

async function registerCommands() {
  const body = commandModules.map((c) => c.data.toJSON());
  const rest = new REST({ version: '10' }).setToken(env.token);

  if (env.multiGuild) {
    await rest.put(Routes.applicationCommands(env.clientId), { body });
    return { scope: 'global', count: body.length };
  }
  if (!env.guildId) {
    throw new Error('GUILD_ID is not set (and MULTI_GUILD is false) — cannot register guild commands.');
  }
  await rest.put(Routes.applicationGuildCommands(env.clientId, env.guildId), { body });
  return { scope: 'guild', guildId: env.guildId, count: body.length };
}

module.exports = { registerCommands };
