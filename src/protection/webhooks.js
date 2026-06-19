// src/protection/webhooks.js
const { Events, AuditLogEvent } = require('discord.js');
const { isTrusted } = require('../core/whitelist');
const { fetchExecutor } = require('../core/auditlog');
const modlog = require('../core/modlog');
const logger = require('../core/logger');

function register(client) {
  client.on(Events.WebhooksUpdate, async (channel) => {
    try {
      const webhooks = await channel.fetchWebhooks().catch(() => null);
      if (!webhooks) return;

      // For attribution in the log only.
      const r = await fetchExecutor(channel.guild, AuditLogEvent.WebhookCreate);
      const member = r?.executorId
        ? await channel.guild.members.fetch(r.executorId).catch(() => null)
        : null;

      // Always inspect EVERY webhook; delete any owned by a non-trusted user.
      let removed = 0;
      for (const wh of webhooks.values()) {
        if (!wh.owner) continue;
        if (wh.owner.id === client.user.id) continue; // never touch our own
        const ownerTrusted = isTrusted({
          id: wh.owner.id,
          guild: channel.guild,
          roles: { cache: { some: () => false } },
        });
        if (ownerTrusted) continue;
        await wh.delete('Anti-nuke: untrusted webhook').catch(() => {});
        removed++;
      }

      if (removed > 0) {
        await modlog.log(channel.guild, {
          title: '🪝 Untrusted webhook(s) removed in #' + channel.name,
          description: `Removed: ${removed}\nLikely by: ${member ? member.user.tag : 'unknown'}`,
          color: 0xF1C40F,
          ping: true,
        });
      }
    } catch (err) {
      logger.error('[webhooks]', err.message);
    }
  });
}

module.exports = { register };
