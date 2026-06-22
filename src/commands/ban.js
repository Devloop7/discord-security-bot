// src/commands/ban.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const modlog = require('../core/modlog');
const logger = require('../core/logger');
const { checkActable } = require('../core/modguard');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban').setDescription('Ban a user')
    .addUserOption((o) => o.setName('user').setDescription('User to ban').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason')),
  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason given';

    // Try to resolve a guild member; null if user isn't in the guild.
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);

    // Only run hierarchy checks when the target is actually in the guild.
    if (member !== null) {
      const { ok, reason: guardReason } = checkActable({ interaction, target: member, action: 'ban' });
      if (!ok) {
        return interaction.reply({ content: `⛔ ${guardReason}`, flags: MessageFlags.Ephemeral });
      }
    }

    try {
      await interaction.guild.members.ban(user.id, { reason });
      await interaction.reply({ content: `⛔ Banned ${user.tag}.`, flags: MessageFlags.Ephemeral });
      await modlog.log(interaction.guild, { title: '⛔ Manual ban', description: `**User:** ${user.tag}\n**By:** ${interaction.user.tag}\n**Reason:** ${reason}`, color: 0xE74C3C });
    } catch (e) {
      logger.error('[ban]', e.message);
      await interaction.reply({ content: `⚠️ Couldn't ban: ${e.message}`, flags: MessageFlags.Ephemeral });
    }
  },
};
