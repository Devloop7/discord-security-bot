// src/commands/warn.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const strikes = require('../core/strikes');
const modlog = require('../core/modlog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn').setDescription('Warn a user (adds a link strike)')
    .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason')),
  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason given';
    const count = strikes.add(user.id, 'link');
    await interaction.reply({ content: `⚠️ Warned ${user.tag} (strike ${count}).`, flags: MessageFlags.Ephemeral });
    await modlog.log(interaction.guild, { title: '⚠️ Manual warn', description: `**User:** ${user.tag}\n**By:** ${interaction.user.tag}\n**Strike:** ${count}\n**Reason:** ${reason}`, color: 0xF1C40F });
  },
};
