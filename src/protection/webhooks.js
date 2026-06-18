// src/protection/webhooks.js
const { Events, AuditLogEvent } = require('discord.js');
const { isTrusted } = require('../core/whitelist');
const { fetchExecutor } = require('../core/auditlog');
const modlog = require('../core/modlog');

function register(client) {
  client.on(Events.WebhooksUpdate, async (channel) => {
    try {
      const webhooks = await channel.fetchWebhooks().catch(() => null);
      if (!webhooks) return;
      const r = await fetchExecutor(channel.guild, AuditLogEvent.WebhookCreate);
      const member = r?.executorId ? await channel.guild.members.fetch(r.executorId).catch(() => null) : null;
      if (member && (isTrusted(member) || member.id === client.user.id)) return;

      // Delete webhooks created by non-trusted users in this channel.
      for (const wh of webhooks.values()) {
        if (wh.owner && wh.owner.id !== client.user.id && !isTrusted({ id: wh.owner.id, guild: channel.guild, roles: { cache: { some: () => false } } })) {
          await wh.delete('Anti-nuke: untrusted webhook').catch(() => {});
        }
      }
      await modlog.log(channel.guild, {
        title: '🪝 Webhook activity in #' + channel.name,
        description: `Untrusted webhooks removed. By: ${member ? member.user.tag : 'unknown'}`,
        color: 0xF1C40F, ping: true,
      });
    } catch (err) {
      console.error('[webhooks]', err.message);
    }
  });
}

module.exports = { register };
