// src/commands/warn.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const cases = require('../core/cases');
const modlog = require('../core/modlog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn').setDescription('Warn a user (recorded in their case history)')
    .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason')),
  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason given';
    const entry = cases.add(user.id, { type: 'warn', modId: interaction.user.id, reason });
    const total = cases.warnings(user.id).length;
    await interaction.reply({ content: `⚠️ Warned ${user.tag} (case #${entry.id}). They now have ${total} warning(s).`, flags: MessageFlags.Ephemeral });
    await modlog.log(interaction.guild, { title: '⚠️ Warning issued', description: `**User:** ${user.tag} (${user.id})\n**By:** ${interaction.user.tag}\n**Case:** #${entry.id}\n**Reason:** ${reason}`, color: 0xF1C40F });
  },
};
