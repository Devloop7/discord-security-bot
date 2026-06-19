// src/commands/register.js — run manually: npm run register
// (The bot also auto-registers on startup; this CLI is for one-off use.)
require('dotenv').config();
const { registerCommands } = require('./registerCommands');
const logger = require('../core/logger');

(async () => {
  try {
    const r = await registerCommands();
    if (r.scope === 'global') {
      logger.info(`✅ Registered ${r.count} GLOBAL commands (every server; may take ~1h to appear).`);
    } else {
      logger.info(`✅ Registered ${r.count} commands to guild ${r.guildId}.`);
    }
  } catch (err) {
    logger.error('Registration failed:', err.message || err);
    process.exit(1);
  }
})();
