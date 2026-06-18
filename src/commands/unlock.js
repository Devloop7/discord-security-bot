// src/commands/unlock.js
const { SlashCommandBuilder, ChannelType, MessageFlags } = require('discord.js');
const modlog = require('../core/modlog');

module.exports = {
  data: new SlashCommandBuilder().setName('unlock').setDescription('Unlock every text channel'),
  async execute(interaction) {
    await interaction.reply({ content: '🔓 Unlocking all channels…', flags: MessageFlags.Ephemeral });
    const everyone = interaction.guild.roles.everyone;
    let n = 0;
    for (const ch of interaction.guild.channels.cache.values()) {
      if (ch.type === ChannelType.GuildText) {
        await ch.permissionOverwrites.edit(everyone, { SendMessages: null }, { reason: `Unlock by ${interaction.user.tag}` }).catch(() => {});
        n++;
      }
    }
    await modlog.log(interaction.guild, { title: '🔓 Server unlocked', description: `By ${interaction.user.tag} — ${n} channels restored.`, color: 0x2ECC71 });
  },
};
