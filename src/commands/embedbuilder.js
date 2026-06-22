// src/commands/embedbuilder.js — /embedbuilder: interactive visual embed builder (staff only)
const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { isStaff } = require('../core/perms');
const { initDraft, renderPanel } = require('../embeds/interactions');
const logger = require('../core/logger');

const data = new SlashCommandBuilder()
  .setName('embedbuilder')
  .setDescription('Open an interactive embed builder (staff only)')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

async function execute(interaction) {
  if (!isStaff(interaction.member, interaction.guildId)) {
    return interaction.reply({ content: '⛔ Staff only.', flags: MessageFlags.Ephemeral });
  }

  try {
    // Fresh in-memory draft for this user, defaulting target to the current channel.
    const draft = initDraft(interaction.user.id, interaction.channelId);
    const panel = renderPanel(draft);

    return interaction.reply({
      ...panel,
      flags: MessageFlags.Ephemeral,
    });
  } catch (err) {
    logger.error('[embedbuilder:execute]', err.message);
    if (!interaction.replied && !interaction.deferred) {
      await interaction
        .reply({ content: '⚠️ Failed to open the embed builder.', flags: MessageFlags.Ephemeral })
        .catch(() => {});
    }
  }
}

module.exports = { data, execute, bypassModGate: true };
