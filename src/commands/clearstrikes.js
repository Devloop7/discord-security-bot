// src/commands/clearstrikes.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const strikes = require('../core/strikes');
const modlog = require('../core/modlog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clearstrikes').setDescription("Clear a user's auto-mod strikes (link + profanity)")
    .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true)),
  async execute(interaction) {
    const user = interaction.options.getUser('user');
    strikes.reset(user.id);
    await interaction.reply({ content: `🧹 Cleared auto-strikes (link + profanity) for ${user.tag}.`, flags: MessageFlags.Ephemeral });
    await modlog.log(interaction.guild, {
      title: '🧹 Strikes cleared',
      description: `**User:** ${user.tag} (${user.id})\n**By:** ${interaction.user.tag}`,
      color: 0x95A5A6,
    });
  },
};
