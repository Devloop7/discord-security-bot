// src/protection/spam.js
const { Events } = require('discord.js');
const RateWindow = require('../core/ratewindow');
const { isFilterExempt } = require('../core/whitelist');
const modlog = require('../core/modlog');
const config = require('../../config');
const logger = require('../core/logger');

function register(client) {
  const flood = new RateWindow(config.spam.perSeconds * 1000);

  async function punish(msg, reason) {
    await msg.delete().catch(() => {});
    if (msg.member?.moderatable) {
      await msg.member.timeout(config.spam.muteMinutes * 60_000, reason).catch(() => {});
    }
    await modlog.log(msg.guild, {
      title: '🔇 Spam muted',
      description: `**User:** ${msg.author.tag} (${msg.author.id})\n**Reason:** ${reason}\n**Mute:** ${config.spam.muteMinutes}m`,
    });
  }

  client.on(Events.MessageCreate, async (msg) => {
    try {
      if (msg.author.bot || !msg.guild) return;
      if (isFilterExempt(msg.member)) return; // owner + admins are never filtered

      // Mass-mention: @everyone/@here or too many user/role pings.
      const mentionCount = msg.mentions.users.size + msg.mentions.roles.size;
      if (msg.mentions.everyone || mentionCount >= config.spam.maxMentions) {
        await punish(msg, 'Mass mention');
        return;
      }

      // Flood: too many messages in the window.
      const count = flood.record(msg.author.id);
      if (count > config.spam.maxMessages) {
        await punish(msg, `Flooding (${count} msgs / ${config.spam.perSeconds}s)`);
        flood.reset(msg.author.id);
      }
    } catch (err) {
      logger.error('[spam]', err.message);
    }
  });
}

module.exports = { register };
