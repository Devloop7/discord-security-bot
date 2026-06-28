// src/commands/vouch.js — /vouch: leave a shop review (opens the star picker → modal).
// Public (bypassModGate). Same flow as the panel's "Leave a Vouch" button.
'use strict';

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const store = require('../vouch/store');
const { starSelectComponents } = require('../vouch/panel');
const guildConfig = require('../core/guildConfig');
const { EMOJI } = require('../ui/theme');
const logger = require('../core/logger');

const DAY_MS = 86400000;

const data = new SlashCommandBuilder()
  .setName('vouch')
  .setDescription('Leave a star review for the shop');

async function execute(interaction) {
  try {
    const cfg = guildConfig.get(interaction.guildId).vouch;
    const remain = store.cooldownRemaining(interaction.guildId, interaction.user.id, (cfg.cooldownDays || 0) * DAY_MS);
    if (remain > 0) {
      const when = Math.floor((Date.now() + remain) / 1000);
      return interaction.reply({
        content: `⏳ You can leave another vouch <t:${when}:R>.`,
        flags: MessageFlags.Ephemeral,
      });
    }
    return interaction.reply({
      content: 'How many stars?',
      components: starSelectComponents(),
      flags: MessageFlags.Ephemeral,
    });
  } catch (e) {
    logger.error('[vouch]', e.message);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: `${EMOJI.warn} Couldn't open the review form.`, flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }
}

module.exports = { data, execute, bypassModGate: true };
