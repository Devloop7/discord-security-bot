// src/commands/ban.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const modlog = require('../core/modlog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban').setDescription('Ban a user')
    .addUserOption((o) => o.setName('user').setDescription('User to ban').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason')),
  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason given';
    await interaction.guild.members.ban(user.id, { reason }).catch((e) => { throw e; });
    await interaction.reply({ content: `⛔ Banned ${user.tag}.`, flags: MessageFlags.Ephemeral });
    await modlog.log(interaction.guild, { title: '⛔ Manual ban', description: `**User:** ${user.tag}\n**By:** ${interaction.user.tag}\n**Reason:** ${reason}`, color: 0xE74C3C });
  },
};
