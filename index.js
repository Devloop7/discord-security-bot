// index.js
require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Events } = require('discord.js');

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
  // require('./src/protection/profanity'),
];
for (const mod of modules) {
  try { mod.register(client); } catch (e) { console.error('[load]', e.message); }
}

client.once(Events.ClientReady, (c) => {
  console.log(`✅ Logged in as ${c.user.tag}. Guarding ${c.guilds.cache.size} server(s).`);
});

// Global safety nets so one bad event never crashes the bot.
process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));
process.on('uncaughtException', (e) => console.error('[uncaughtException]', e));

client.login(process.env.BOT_TOKEN);
