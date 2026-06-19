// src/protection/antibot.js
const { Events, AuditLogEvent } = require('discord.js');
const { fetchExecutor } = require('../core/auditlog');
const { isTrusted } = require('../core/whitelist');
const modlog = require('../core/modlog');
const logger = require('../core/logger');

function register(client) {
  client.on(Events.GuildMemberAdd, async (member) => {
    try {
      if (!member.user.bot) return;
      if (member.id === client.user.id) return; // never act on ourselves
      const r = await fetchExecutor(member.guild, AuditLogEvent.BotAdd, member.id);
      const adder = r?.executorId ? await member.guild.members.fetch(r.executorId).catch(() => null) : null;
      if (adder && isTrusted(adder)) return; // trusted user added it → allow

      await member.kick('Anti-bot: bot added by non-trusted user').catch(() => {});
      await modlog.log(member.guild, {
        title: '🤖 Unauthorized bot kicked',
        description: `**Bot:** ${member.user.tag}\n**Added by:** ${adder ? adder.user.tag : 'unknown'}`,
        color: 0xE74C3C, ping: true,
      });
    } catch (err) {
      logger.error('[antibot]', err.message);
    }
  });
}

module.exports = { register };
