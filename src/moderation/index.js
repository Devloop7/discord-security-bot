// src/moderation/index.js — registers moderation scheduler handlers.
const scheduler = require('../core/scheduler');

// Wire up durable timer handlers. Handlers must never throw.
function register(client) {
  // Lift an expired tempban: unban the user and post to the mod-log.
  scheduler.register('tempban-lift', async (data, c) => {
    try {
      const guild = c.guilds.cache.get(data.guildId) || await c.guilds.fetch(data.guildId).catch(() => null);
      if (!guild) return;
      await guild.members.unban(data.userId, 'Tempban expired').catch(() => {});
      const modlog = require('../core/modlog');
      await modlog.log(guild, {
        title: '⏲️ Tempban expired — unbanned',
        description: `**User:** <@${data.userId}> (${data.userId})`,
        color: 0x2ECC71,
      });
    } catch (e) {
      require('../core/logger').error('[tempban-lift]', e.message);
    }
  });
}

module.exports = { register };
