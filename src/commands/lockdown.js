// src/commands/lockdown.js
const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const modlog = require('../core/modlog');

module.exports = {
  data: new SlashCommandBuilder().setName('lockdown').setDescription('Lock every text channel (panic button)'),
  async execute(interaction) {
    await interaction.reply({ content: '🔒 Locking down all channels…', flags: MessageFlags.Ephemeral });
    const everyone = interaction.guild.roles.everyone;
    let n = 0;
    for (const ch of interaction.guild.channels.cache.values()) {
      if (ch.type === ChannelType.GuildText) {
        await ch.permissionOverwrites.edit(everyone, { SendMessages: false }, { reason: `Lockdown by ${interaction.user.tag}` }).catch(() => {});
        n++;
      }
    }
    await modlog.log(interaction.guild, { title: '🔒 SERVER LOCKDOWN', description: `By ${interaction.user.tag} — ${n} channels locked.`, color: 0xE74C3C, ping: true });
  },
};
