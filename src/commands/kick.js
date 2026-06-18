// src/commands/kick.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const modlog = require('../core/modlog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick').setDescription('Kick a user')
    .addUserOption((o) => o.setName('user').setDescription('User to kick').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason')),
  async execute(interaction) {
    const member = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason') || 'No reason given';
    if (!member) return interaction.reply({ content: 'User not in server.', flags: MessageFlags.Ephemeral });
    await member.kick(reason);
    await interaction.reply({ content: `👢 Kicked ${member.user.tag}.`, flags: MessageFlags.Ephemeral });
    await modlog.log(interaction.guild, { title: '👢 Manual kick', description: `**User:** ${member.user.tag}\n**By:** ${interaction.user.tag}\n**Reason:** ${reason}`, color: 0xE67E22 });
  },
};
