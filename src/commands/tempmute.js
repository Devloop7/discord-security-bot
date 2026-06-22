// src/commands/tempmute.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const modlog = require('../core/modlog');
const logger = require('../core/logger');
const cases = require('../core/cases');
const { checkActable } = require('../core/modguard');
const { parseDuration } = require('../core/duration');

// Discord native timeout cap is 28 days.
const MAX_TIMEOUT_MS = 2_419_200_000;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tempmute').setDescription('Timeout (mute) a user for a duration')
    .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true))
    .addStringOption((o) => o.setName('duration').setDescription('Duration e.g. 10m, 2h, 3d, 1w').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason')),
  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const durationStr = interaction.options.getString('duration');
    const reason = interaction.options.getString('reason') || 'No reason given';

    // Parse + validate the duration.
    let ms = parseDuration(durationStr);
    if (ms <= 0) {
      return interaction.reply({ content: '⛔ Invalid duration. Use a number + m/h/d/w (e.g. 10m, 2h, 3d, 1w).', flags: MessageFlags.Ephemeral });
    }

    // Discord native timeout maxes out at 28 days — clamp and note it.
    let clamped = false;
    if (ms > MAX_TIMEOUT_MS) {
      ms = MAX_TIMEOUT_MS;
      clamped = true;
    }

    // Prefer the cached member; fall back to a live fetch for uncached members.
    let member = interaction.options.getMember('user');
    if (!member) member = await interaction.guild.members.fetch(user.id).catch(() => null);

    const { ok, reason: guardReason } = checkActable({ interaction, target: member, action: 'mute' });
    if (!ok) {
      return interaction.reply({ content: `⛔ ${guardReason}`, flags: MessageFlags.Ephemeral });
    }

    try {
      await member.timeout(ms, `Tempmute by ${interaction.user.tag}: ${reason}`);
      cases.add(user.id, { type: 'tempmute', modId: interaction.user.id, reason });

      const liftAt = Math.floor((Date.now() + ms) / 1000); // unix seconds for Discord timestamp
      const note = clamped ? ' (clamped to Discord max of 28d)' : '';
      await interaction.reply({ content: `🔇 Muted ${member.user.tag}${note}. Lifts <t:${liftAt}:R>.`, flags: MessageFlags.Ephemeral });
      await modlog.log(interaction.guild, {
        title: '🔇 Temp mute',
        description: `**User:** ${member.user.tag}\n**By:** ${interaction.user.tag}\n**Lifts:** <t:${liftAt}:R>${clamped ? ' (clamped to 28d)' : ''}\n**Reason:** ${reason}`,
        color: 0xE67E22,
      });
    } catch (e) {
      logger.error('[tempmute]', e.message);
      await interaction.reply({ content: `⚠️ Couldn't tempmute: ${e.message}`, flags: MessageFlags.Ephemeral });
    }
  },
};
