// src/commands/clearwarnings.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const cases = require('../core/cases');
const modlog = require('../core/modlog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clearwarnings').setDescription("Clear ALL of a user's warnings and notes")
    .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true)),
  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const n = cases.clear(user.id);
    await interaction.reply({ content: `🧹 Cleared ${n} case(s) for ${user.tag}.`, flags: MessageFlags.Ephemeral });
    await modlog.log(interaction.guild, { title: '🧹 Cases cleared', description: `**User:** ${user.tag} (${user.id})\n**By:** ${interaction.user.tag}\n**Removed:** ${n}`, color: 0x95A5A6 });
  },
};
