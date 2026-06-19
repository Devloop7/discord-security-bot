// src/protection/antiraid.js
const { Events, GuildVerificationLevel } = require('discord.js');
const RateWindow = require('../core/ratewindow');
const modlog = require('../core/modlog');
const config = require('../../config');
const logger = require('../core/logger');

function register(client) {
  const joins = new RateWindow(config.antiraid.perSeconds * 1000);
  const lockedGuilds = new Set();

  function ageDays(user) {
    return (Date.now() - user.createdTimestamp) / 86_400_000;
  }

  async function lockdown(guild) {
    if (lockedGuilds.has(guild.id)) return;
    lockedGuilds.add(guild.id);
    await guild.setVerificationLevel(GuildVerificationLevel.High, 'Anti-raid lockdown').catch(() => {});
    await modlog.log(guild, {
      title: '🚨 RAID DETECTED — lockdown engaged',
      description: `Verification raised; new young accounts will be quarantined for ${config.antiraid.lockMinutes}m.`,
      color: 0xE74C3C, ping: true,
    });
    setTimeout(async () => {
      lockedGuilds.delete(guild.id);
      await guild.setVerificationLevel(GuildVerificationLevel.Medium, 'Anti-raid lifted').catch(() => {});
      await modlog.log(guild, { title: '✅ Raid lockdown lifted', description: 'Verification restored to Medium.', color: 0x2ECC71 });
    }, config.antiraid.lockMinutes * 60_000);
  }

  client.on(Events.GuildMemberAdd, async (member) => {
    try {
      if (member.user.bot) return;
      const count = joins.record(member.guild.id);
      const raiding = count >= config.antiraid.maxJoins;

      if (raiding) await lockdown(member.guild);

      // During an active lockdown, kick freshly-created accounts.
      if (lockedGuilds.has(member.guild.id) && ageDays(member.user) < config.antiraid.minAccountAgeDays) {
        await member.kick('Anti-raid: new account during raid').catch(() => {});
        await modlog.log(member.guild, {
          title: '👢 Raid account kicked',
          description: `**User:** ${member.user.tag}\n**Account age:** ${ageDays(member.user).toFixed(1)} days`,
        });
      }
    } catch (err) {
      logger.error('[antiraid]', err.message);
    }
  });
}

module.exports = { register };
