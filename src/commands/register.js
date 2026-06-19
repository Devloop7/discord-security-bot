// src/commands/register.js — run: npm run register
require('dotenv').config();
const { REST, Routes } = require('discord.js');
const env = require('../core/env');
const { commandModules } = require('./index');
const logger = require('../core/logger');

const body = commandModules.map((c) => c.data.toJSON());
const rest = new REST({ version: '10' }).setToken(env.token);

(async () => {
  try {
    if (env.multiGuild) {
      await rest.put(Routes.applicationCommands(env.clientId), { body });
      logger.info(`✅ Registered ${body.length} GLOBAL commands (every server; may take ~1h to appear).`);
    } else {
      await rest.put(Routes.applicationGuildCommands(env.clientId, env.guildId), { body });
      logger.info(`✅ Registered ${body.length} commands to guild ${env.guildId}.`);
    }
  } catch (err) {
    logger.error('Registration failed:', err);
    process.exit(1);
  }
})();
