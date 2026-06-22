// src/commands/mute.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const modlog = require('../core/modlog');
const logger = require('../core/logger');
const { checkActable } = require('../core/modguard');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mute').setDescription('Timeout a user for N minutes')
    .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true))
    .addIntegerOption((o) => o.setName('minutes').setDescription('Minutes (1–40320)').setRequired(true)),
  async execute(interaction) {
    const minutes = interaction.options.getInteger('minutes');
    const userId = interaction.options.getUser('user').id;

    // Validate range: Discord max timeout is 28 days = 40320 minutes.
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 40320) {
      return interaction.reply({ content: '⛔ Minutes must be between 1 and 40320 (28 days).', flags: MessageFlags.Ephemeral });
    }

    // Prefer the cached member; fall back to a live fetch for uncached members.
    let member = interaction.options.getMember('user');
    if (!member) member = await interaction.guild.members.fetch(userId).catch(() => null);

    const { ok, reason: guardReason } = checkActable({ interaction, target: member, action: 'mute' });
    if (!ok) {
      return interaction.reply({ content: `⛔ ${guardReason}`, flags: MessageFlags.Ephemeral });
    }

    const reason = `Muted by ${interaction.user.tag}`;
    try {
      await member.timeout(minutes * 60_000, reason);
      await interaction.reply({ content: `🔇 Muted ${member.user.tag} for ${minutes}m.`, flags: MessageFlags.Ephemeral });
      await modlog.log(interaction.guild, { title: '🔇 Manual mute', description: `**User:** ${member.user.tag}\n**By:** ${interaction.user.tag}\n**Length:** ${minutes}m`, color: 0xE67E22 });
    } catch (e) {
      logger.error('[mute]', e.message);
      await interaction.reply({ content: `⚠️ Couldn't mute: ${e.message}`, flags: MessageFlags.Ephemeral });
    }
  },
};
