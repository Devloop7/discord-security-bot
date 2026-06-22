// index.js
require('dotenv').config();
const env = require('./src/core/env');
const { Client, GatewayIntentBits, Partials, Events } = require('discord.js');
const logger = require('./src/core/logger');
const { registerCommands } = require('./src/commands/registerCommands');
const scheduler = require('./src/core/scheduler');

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
  require('./src/moderation'),
  require('./src/utility'),
  require('./src/reactionroles'),
  require('./src/commands'),
  require('./src/tickets/interactions'),
  require('./src/embeds/interactions'),
  require('./src/autopost'),
  require('./src/autoresponder/events'),
  require('./src/welcome/events'),
];
for (const mod of modules) {
  try { mod.register(client); } catch (e) { logger.error('[load]', e.message); }
}

client.once(Events.ClientReady, async (c) => {
  // Use warn level for startup confirmations so they're visible even in
  // production (LOG_LEVEL=warn), where info logs are suppressed.
  logger.warn(`✅ Logged in as ${c.user.tag}. Guarding ${c.guilds.cache.size} server(s).`);
  // Auto-register slash commands on startup so hosts that only run `npm start`
  // (e.g. Railway) still get commands registered — no manual step needed.
  try {
    const r = await registerCommands();
    if (r.scope === 'global') {
      logger.warn(`✅ Auto-registered ${r.count} global slash commands (may take ~1h to appear).`);
    } else {
      logger.warn(`✅ Auto-registered ${r.count} slash commands to guild ${r.guildId}.`);
    }
  } catch (e) {
    logger.error('[auto-register] failed:', e.message || e);
  }
  try {
    const fs = require('node:fs');
    const dir = require('./src/core/store').dataDir();
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
    logger.warn(`💾 Data dir: ${dir} (writable). On Railway, mount a Volume here (set BOT_DATA_DIR) or data is wiped each deploy.`);
  } catch (e) {
    logger.error('❌ Data dir not writable — tickets/warnings will not persist:', e.message);
  }
  await scheduler.init(c);
  logger.info('⏰ Scheduler initialized.');
});

// Global safety nets so one bad event never crashes the bot.
process.on('unhandledRejection', (e) => logger.error('[unhandledRejection]', e));
process.on('uncaughtException', (e) => logger.error('[uncaughtException]', e));

if (!env.token) {
  logger.error('❌ No bot token found. Set DISCORD_TOKEN (or BOT_TOKEN) in your environment / Railway Variables.');
  process.exit(1);
}

client.login(env.token).catch((e) => {
  // Surfaces the real reason clearly (e.g. invalid token, or "Used disallowed intents").
  logger.error('❌ Discord login failed:', e.message || e);
  if (String(e.message || '').toLowerCase().includes('disallowed intents')) {
    logger.error('   → Enable MESSAGE CONTENT + SERVER MEMBERS intents in the Developer Portal (Bot tab).');
  }
  process.exit(1);
});
