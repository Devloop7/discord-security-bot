// index.js
require('dotenv').config();
const env = require('./src/core/env');
const { Client, GatewayIntentBits, Partials, Events } = require('discord.js');
const logger = require('./src/core/logger');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,   // privileged
    GatewayIntentBits.GuildMembers,     // privileged
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildWebhooks,
  ],
  partials: [Partials.Channel, Partials.GuildMember],
});

// Protection + command modules are registered here as later phases add them.
const modules = [
  require('./src/protection/profanity'),
  require('./src/protection/links'),
  require('./src/protection/spam'),
  require('./src/protection/antinuke'),
  require('./src/protection/webhooks'),
  require('./src/protection/antibot'),
  require('./src/protection/antiraid'),
  require('./src/commands'),
];
for (const mod of modules) {
  try { mod.register(client); } catch (e) { logger.error('[load]', e.message); }
}

client.once(Events.ClientReady, (c) => {
  logger.info(`✅ Logged in as ${c.user.tag}. Guarding ${c.guilds.cache.size} server(s).`);
});

// Global safety nets so one bad event never crashes the bot.
process.on('unhandledRejection', (e) => logger.error('[unhandledRejection]', e));
process.on('uncaughtException', (e) => logger.error('[uncaughtException]', e));

client.login(env.token);
