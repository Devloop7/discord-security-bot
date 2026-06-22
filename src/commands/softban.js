// src/commands/softban.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const modlog = require('../core/modlog');
const logger = require('../core/logger');
const cases = require('../core/cases');
const { checkActable } = require('../core/modguard');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('softban').setDescription('Ban then immediately unban to purge recent messages')
    .addUserOption((o) => o.setName('user').setDescription('User to softban').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason'))
    .addIntegerOption((o) => o.setName('delete_days').setDescription('Days of messages to delete (1–7)').setMinValue(1).setMaxValue(7)),
  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason given';
    const deleteDays = interaction.options.getInteger('delete_days') || 1;

    // Prefer the cached member; fall back to a live fetch for uncached members.
    let member = interaction.options.getMember('user');
    if (!member) member = await interaction.guild.members.fetch(user.id).catch(() => null);

    // Only run hierarchy checks when the target is actually in the guild.
    if (member !== null) {
      const { ok, reason: guardReason } = checkActable({ interaction, target: member, action: 'softban' });
      if (!ok) {
        return interaction.reply({ content: `⛔ ${guardReason}`, flags: MessageFlags.Ephemeral });
      }
    }

    try {
      // Ban (purging messages) then immediately unban so the user can rejoin.
      await interaction.guild.members.ban(user.id, {
        reason: `Softban by ${interaction.user.tag}: ${reason}`,
        deleteMessageSeconds: deleteDays * 86400,
      });
      await interaction.guild.members.unban(user.id, 'Softban (auto-unban)');
      cases.add(user.id, { type: 'softban', modId: interaction.user.id, reason });
      await interaction.reply({ content: `🧹 Softbanned ${user.tag} (purged ${deleteDays}d of messages).`, flags: MessageFlags.Ephemeral });
      await modlog.log(interaction.guild, { title: '🧹 Softban', description: `**User:** ${user.tag}\n**By:** ${interaction.user.tag}\n**Deleted:** ${deleteDays}d of messages\n**Reason:** ${reason}`, color: 0xE67E22 });
    } catch (e) {
      logger.error('[softban]', e.message);
      await interaction.reply({ content: `⚠️ Couldn't softban: ${e.message}`, flags: MessageFlags.Ephemeral });
    }
  },
};
