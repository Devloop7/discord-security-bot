// src/commands/slowmode.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const modlog = require('../core/modlog');
const logger = require('../core/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('slowmode').setDescription("Set a channel's slowmode")
    .addIntegerOption((o) => o.setName('seconds').setDescription('Seconds (0–21600)').setRequired(true).setMinValue(0).setMaxValue(21600))
    .addChannelOption((o) => o.setName('channel').setDescription('Target channel (default: current)')),
  async execute(interaction) {
    const seconds = interaction.options.getInteger('seconds');
    const channel = interaction.options.getChannel('channel') || interaction.channel;

    // Validate range: Discord allows 0–21600s (6h) of slowmode.
    if (!Number.isInteger(seconds) || seconds < 0 || seconds > 21600) {
      return interaction.reply({ content: '⛔ Seconds must be between 0 and 21600 (6 hours).', flags: MessageFlags.Ephemeral });
    }

    // Only text-based channels expose setRateLimitPerUser (excludes voice/categories).
    if (!channel || typeof channel.setRateLimitPerUser !== 'function') {
      return interaction.reply({ content: '⛔ That channel does not support slowmode.', flags: MessageFlags.Ephemeral });
    }

    const reason = `Slowmode by ${interaction.user.tag}`;
    try {
      await channel.setRateLimitPerUser(seconds, reason);
      const msg = seconds === 0
        ? `🐢 Slowmode disabled in <#${channel.id}>.`
        : `🐢 Slowmode set to ${seconds}s in <#${channel.id}>.`;
      await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
      await modlog.log(interaction.guild, { title: '🐢 Slowmode', description: `**Channel:** <#${channel.id}>\n**By:** ${interaction.user.tag}\n**Delay:** ${seconds}s`, color: 0x3498DB });
    } catch (e) {
      logger.error('[slowmode]', e.message);
      await interaction.reply({ content: `⚠️ Couldn't set slowmode: ${e.message}`, flags: MessageFlags.Ephemeral });
    }
  },
};
