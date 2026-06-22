// src/utility/index.js — interaction router + scheduler handler for polls/suggestions.
// Polls/suggestions are keyed by their MESSAGE id; a button click maps back via
// interaction.message.id. Follows the namespace early-return discipline: any customId
// that isn't poll:/suggest: is ignored so other routers can handle it.
'use strict';

const { Events, MessageFlags } = require('discord.js');
const pollStore = require('./pollStore');
const suggestStore = require('./suggestStore');
const scheduler = require('../core/scheduler');
const logger = require('../core/logger');

function register(client) {
  // Durable poll auto-close: re-fetches the message, closes the poll, and disables buttons.
  scheduler.register('poll-close', async (data, c) => {
    try {
      const ch =
        c.channels.cache.get(data.channelId) ||
        (await c.channels.fetch(data.channelId).catch(() => null));
      if (!ch) return;
      const msg = await ch.messages.fetch(data.messageId).catch(() => null);
      const p = await pollStore.closePoll(data.messageId);
      if (!msg || !p) return;
      await msg.edit({
        embeds: [pollStore.renderEmbed(p)],
        components: pollStore.renderRows(p, { disabled: true }),
      });
    } catch (e) {
      logger.error('[poll-close]', e.message);
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (!interaction.isButton()) return;
      const id = interaction.customId;

      if (id.startsWith('poll:')) {
        const idx = parseInt(id.slice(5), 10);
        const p = await pollStore.vote(interaction.message.id, interaction.user.id, idx);
        if (!p) {
          return interaction.reply({
            content: 'This poll is closed or no longer exists.',
            flags: MessageFlags.Ephemeral,
          });
        }
        return interaction.update({
          embeds: [pollStore.renderEmbed(p)],
          components: pollStore.renderRows(p),
        });
      }

      if (id.startsWith('suggest:')) {
        const dir = id.slice('suggest:'.length);
        if (dir !== 'up' && dir !== 'down') return;
        const s = await suggestStore.toggleVote(interaction.message.id, interaction.user.id, dir);
        if (!s) {
          return interaction.reply({
            content: 'This suggestion no longer exists.',
            flags: MessageFlags.Ephemeral,
          });
        }
        const author = await client.users.fetch(s.authorId).catch(() => null);
        return interaction.update({
          embeds: [suggestStore.renderEmbed(s, author?.tag)],
          components: suggestStore.renderRows(false),
        });
      }
    } catch (e) {
      logger.error('[utility:interactions]', e.message);
    }
  });
}

module.exports = { register };
