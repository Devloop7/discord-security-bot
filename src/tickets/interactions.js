// src/tickets/interactions.js — route ticket-related Discord interactions.
// Register with client via register(client). Do NOT import from index.js yet (Chunk 5 handles that).
'use strict';

const {
  Events,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  MessageFlags,
} = require('discord.js');

const { getConfig, openCount } = require('../core/ticketStore');
const actions = require('./actions');
const logger = require('../core/logger');

// ---------------------------------------------------------------------------
// In-memory rate limiter  (max 3 hits per 60 000 ms window, per key)
// ---------------------------------------------------------------------------
const rl = new Map(); // key → number[]  (array of timestamps)

const RL_MAX = 3;
const RL_WINDOW = 60_000; // ms

/**
 * Returns true when the hit is allowed; false when the key is rate-limited.
 * Prunes expired timestamps on every call.
 */
function hit(key) {
  const now = Date.now();
  const timestamps = (rl.get(key) || []).filter((t) => now - t < RL_WINDOW);
  if (timestamps.length >= RL_MAX) {
    rl.set(key, timestamps);
    return false;
  }
  timestamps.push(now);
  rl.set(key, timestamps);
  return true;
}

// ---------------------------------------------------------------------------
// register
// ---------------------------------------------------------------------------

function register(client) {
  client.on(Events.InteractionCreate, async (interaction) => {
    // We only care about ticket-related interactions; everything else is
    // handled by the slash-command dispatcher registered elsewhere.
    const isTicketButton =
      interaction.isButton() &&
      (interaction.customId.startsWith('ticket_') ||
        interaction.customId === 'create_ticket');

    const isTicketModal =
      interaction.isModalSubmit() &&
      interaction.customId === 'create_ticket_modal';

    if (!isTicketButton && !isTicketModal) return;

    try {
      if (interaction.isButton()) {
        const [name, ...args] = interaction.customId.split(':');

        switch (name) {
          case 'create_ticket': {
            // Rate-limit check.
            if (!hit(`${interaction.user.id}:create_ticket`)) {
              return interaction.reply({
                content: "You're doing that too fast, slow down.",
                flags: MessageFlags.Ephemeral,
              });
            }

            // Per-user open-ticket cap.
            const guildId = interaction.guildId;
            const cfg = getConfig(guildId);
            if (openCount(guildId, interaction.user.id) >= cfg.maxTicketsPerUser) {
              return interaction.reply({
                content: `You've reached the max of ${cfg.maxTicketsPerUser} open tickets.`,
                flags: MessageFlags.Ephemeral,
              });
            }

            // Show the modal.
            const modal = new ModalBuilder()
              .setCustomId('create_ticket_modal')
              .setTitle('Create a Ticket');

            const reasonInput = new TextInputBuilder()
              .setCustomId('reason')
              .setLabel('Why are you creating this ticket?')
              .setStyle(TextInputStyle.Paragraph)
              .setPlaceholder('Describe your issue...')
              .setRequired(true)
              .setMaxLength(1000);

            modal.addComponents(
              new ActionRowBuilder().addComponents(reasonInput),
            );

            return interaction.showModal(modal);
          }

          case 'ticket_claim':
            return actions.claim(interaction);

          case 'ticket_unclaim':
            return actions.unclaim(interaction);

          case 'ticket_pin':
            return actions.pin(interaction);

          case 'ticket_priority':
            return actions.setPriority(interaction, args[0]);

          default:
            // ticket_close / ticket_reopen / ticket_delete / ticket_feedback*
            // — handled by later chunks; ignore here.
            return;
        }
      }

      if (interaction.isModalSubmit() && interaction.customId === 'create_ticket_modal') {
        return actions.openTicket(interaction);
      }
    } catch (e) {
      logger.error('[ticket:interaction]', e.message);

      // Try to surface a user-facing error if the interaction is still open.
      if (
        interaction.isRepliable() &&
        !interaction.replied &&
        !interaction.deferred
      ) {
        await interaction
          .reply({ content: '⚠️ Something went wrong.', flags: MessageFlags.Ephemeral })
          .catch(() => {});
      }
    }
  });
}

module.exports = { register };
