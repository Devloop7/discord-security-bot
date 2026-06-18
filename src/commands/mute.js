// src/commands/mute.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const modlog = require('../core/modlog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mute').setDescription('Timeout a user for N minutes')
    .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true))
    .addIntegerOption((o) => o.setName('minutes').setDescription('Minutes').setRequired(true)),
  async execute(interaction) {
    const member = interaction.options.getMember('user');
    const minutes = interaction.options.getInteger('minutes');
    if (!member) return interaction.reply({ content: 'User not in server.', flags: MessageFlags.Ephemeral });
    await member.timeout(minutes * 60_000, `Muted by ${interaction.user.tag}`);
    await interaction.reply({ content: `🔇 Muted ${member.user.tag} for ${minutes}m.`, flags: MessageFlags.Ephemeral });
    await modlog.log(interaction.guild, { title: '🔇 Manual mute', description: `**User:** ${member.user.tag}\n**By:** ${interaction.user.tag}\n**Length:** ${minutes}m`, color: 0xE67E22 });
  },
};
