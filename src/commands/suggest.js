// src/commands/suggest.js — /suggest: post a community suggestion with vote buttons (public)
// bypassModGate = true: this is a public command; the dispatcher skips the global
// isMod gate so anyone can submit a suggestion. The suggestion is posted to the
// channel configured via `/suggestions setup #channel` (guildConfig.suggestions.channelId).
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const guildConfig = require('../core/guildConfig');
const suggestStore = require('../utility/suggestStore');
const logger = require('../core/logger');

const data = new SlashCommandBuilder()
  .setName('suggest')
  .setDescription('Submit a suggestion for the server to vote on')
  .addStringOption((o) =>
    o.setName('text').setDescription('Your suggestion').setRequired(true),
  );

async function execute(interaction) {
  try {
    const text = interaction.options.getString('text');

    const cfg = guildConfig.get(interaction.guild.id);
    const chId = cfg.suggestions.channelId;
    if (!chId) {
      return interaction.reply({
        content: "⚠️ Suggestions aren't set up yet — an admin must run /suggestions setup #channel.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const ch =
      interaction.guild.channels.cache.get(chId) ||
      (await interaction.guild.channels.fetch(chId).catch(() => null));
    if (!ch) {
      return interaction.reply({
        content: "⚠️ The configured suggestions channel no longer exists — an admin must re-run /suggestions setup #channel.",
        flags: MessageFlags.Ephemeral,
      });
    }

    // Render off a transient draft; the persisted record is created from msg.id below.
    const draft = { text, up: [], down: [] };
    const msg = await ch.send({
      embeds: [suggestStore.renderEmbed(draft, interaction.user.tag)],
      components: suggestStore.renderRows(false),
    });

    await suggestStore.addSuggestion(msg.id, {
      guildId: interaction.guild.id,
      channelId: chId,
      authorId: interaction.user.id,
      text,
    });

    // A discussion thread is a nice-to-have; never fail the command if it can't be created.
    await msg.startThread({ name: 'Discussion'.slice(0, 90) }).catch(() => {});

    await interaction.reply({
      content: `✅ Suggestion submitted in <#${chId}>.`,
      flags: MessageFlags.Ephemeral,
    });
  } catch (e) {
    logger.error('[suggest]', e.message);
    if (!interaction.replied && !interaction.deferred) {
      await interaction
        .reply({ content: "⚠️ Couldn't submit your suggestion.", flags: MessageFlags.Ephemeral })
        .catch(() => {});
    } else {
      await interaction
        .followUp({ content: "⚠️ Couldn't submit your suggestion.", flags: MessageFlags.Ephemeral })
        .catch(() => {});
    }
  }
}

module.exports = { data, execute, bypassModGate: true };
