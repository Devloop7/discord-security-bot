// src/commands/suggestions.js — /suggestions configuration (mod command).
// No bypassModGate: the dispatcher gates this command behind the mod check.
const {
  SlashCommandBuilder,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');
const guildConfig = require('../core/guildConfig');
const logger = require('../core/logger');

const BRAND = 0x5865F2;

const data = new SlashCommandBuilder()
  .setName('suggestions')
  .setDescription('Configure where /suggest posts land')
  // ── setup ────────────────────────────────────────────────────────────────
  .addSubcommand((sub) =>
    sub
      .setName('setup')
      .setDescription('Set the channel suggestions are posted to')
      .addChannelOption((o) =>
        o
          .setName('channel')
          .setDescription('Channel to post suggestions in')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(true),
      ),
  )
  // ── status ───────────────────────────────────────────────────────────────
  .addSubcommand((sub) =>
    sub
      .setName('status')
      .setDescription('Show the currently configured suggestions channel'),
  );

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guild.id;

  try {
    if (sub === 'setup') {
      const channel = interaction.options.getChannel('channel');

      // Guard against non-text-based channels (must be postable).
      if (!channel || typeof channel.send !== 'function') {
        return interaction.reply({
          content: '⚠️ Please pick a text channel I can post messages in.',
          flags: MessageFlags.Ephemeral,
        });
      }

      guildConfig.set(guildId, { suggestions: { channelId: channel.id } });

      return interaction.reply({
        content: `✅ Suggestions will post to <#${channel.id}>.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'status') {
      const { channelId } = guildConfig.get(guildId).suggestions;

      const embed = new EmbedBuilder()
        .setTitle('💡 Suggestions configuration')
        .setColor(BRAND)
        .setDescription(
          channelId
            ? `Suggestions are posted to <#${channelId}>.`
            : 'Suggestions are **not configured**. Run `/suggestions setup` to pick a channel.',
        )
        .setTimestamp();

      return interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
      });
    }
  } catch (e) {
    logger.error('[suggestions]', e.message);
    if (!interaction.replied && !interaction.deferred) {
      await interaction
        .reply({
          content: '⚠️ Suggestions command failed. Please try again.',
          flags: MessageFlags.Ephemeral,
        })
        .catch(() => {});
    }
  }
}

module.exports = { data, execute };
