// src/commands/register.js — run: npm run register
require('dotenv').config();
const { REST, Routes } = require('discord.js');
const config = require('../../config');
const { commandModules } = require('./index');

const body = commandModules.map((c) => c.data.toJSON());
const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

(async () => {
  try {
    await rest.put(Routes.applicationGuildCommands(process.env.APP_ID, config.guildId), { body });
    console.log(`✅ Registered ${body.length} commands to guild ${config.guildId}`);
  } catch (err) {
    console.error('Registration failed:', err);
    process.exit(1);
  }
})();
