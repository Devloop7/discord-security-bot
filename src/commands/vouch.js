// src/commands/vouch.js — /vouch: leave a shop review (opens the star picker → modal).
// Public (bypassModGate). Same flow as the panel's "Leave a Vouch" button.
'use strict';

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const store = require('../vouch/store');
const { starSelectComponents } = require('../vouch/panel');
const { EMOJI } = require('../ui/theme');
const logger = require('../core/logger');

const data = new SlashCommandBuilder()
  .setName('vouch')
  .setDescription('Leave a star review for the shop');

async function execute(interaction) {
  try {
    if (store.hasReviewed(interaction.guildId, interaction.user.id)) {
      return interaction.reply({
        content: `${EMOJI.success} You've already left a review — thank you! 🙏`,
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
