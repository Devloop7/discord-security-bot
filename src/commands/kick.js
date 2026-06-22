// src/commands/kick.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const modlog = require('../core/modlog');
const logger = require('../core/logger');
const { checkActable } = require('../core/modguard');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick').setDescription('Kick a user')
    .addUserOption((o) => o.setName('user').setDescription('User to kick').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason')),
  async execute(interaction) {
    const reason = interaction.options.getString('reason') || 'No reason given';
    const userId = interaction.options.getUser('user').id;

    // Prefer the cached member; fall back to a live fetch for uncached members.
    let member = interaction.options.getMember('user');
    if (!member) member = await interaction.guild.members.fetch(userId).catch(() => null);

    const { ok, reason: guardReason } = checkActable({ interaction, target: member, action: 'kick' });
    if (!ok) {
      return interaction.reply({ content: `⛔ ${guardReason}`, flags: MessageFlags.Ephemeral });
    }

    try {
      await member.kick(reason);
      await interaction.reply({ content: `👢 Kicked ${member.user.tag}.`, flags: MessageFlags.Ephemeral });
      await modlog.log(interaction.guild, { title: '👢 Manual kick', description: `**User:** ${member.user.tag}\n**By:** ${interaction.user.tag}\n**Reason:** ${reason}`, color: 0xE67E22 });
    } catch (e) {
      logger.error('[kick]', e.message);
      await interaction.reply({ content: `⚠️ Couldn't kick: ${e.message}`, flags: MessageFlags.Ephemeral });
    }
  },
};
