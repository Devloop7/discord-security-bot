// src/commands/banner.js
// bypassModGate = true: public utility command, no moderator gate.
const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');
const logger = require('../core/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('banner').setDescription("Show a user's profile banner")
    .addUserOption((o) => o.setName('user').setDescription('User (defaults to you)')),
  async execute(interaction) {
    const user = interaction.options.getUser('user') || interaction.user;
    try {
      // Banners aren't included on the base user object — force a fresh fetch.
      const u = await interaction.client.users.fetch(user.id, { force: true });
      const url = u.bannerURL({ size: 1024 });

      if (!url) {
        const embed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setDescription(`**${u.tag}** has no banner set.`)
          .setTimestamp();
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`${u.tag}'s banner`)
        .setDescription(`[Open in browser](${url})`)
        .setImage(url)
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    } catch (e) {
      logger.error('[banner]', e.message);
      return interaction.reply({ content: `⚠️ Couldn't fetch banner: ${e.message}`, flags: MessageFlags.Ephemeral });
    }
  },
  bypassModGate: true,
};
