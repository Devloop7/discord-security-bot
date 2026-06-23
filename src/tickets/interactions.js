// src/tickets/interactions.js — route ticket buttons, selects and modals.
'use strict';

const {
  Events, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags,
} = require('discord.js');

const { getConfig, openCount } = require('../core/ticketStore');
const { EMOJI, COLORS } = require('../ui/theme');
const { noticeEmbed } = require('./embeds');
const actions = require('./actions');
const feedback = require('./feedback');
const logger = require('../core/logger');

// ── in-memory rate limiter (3 hits / 60s per key) ────────────────────────────
const rl = new Map();
const RL_MAX = 3;
const RL_WINDOW = 60_000;
function hit(key) {
  const now = Date.now();
  const ts = (rl.get(key) || []).filter((t) => now - t < RL_WINDOW);
  if (ts.length >= RL_MAX) { rl.set(key, ts); return false; }
  ts.push(now); rl.set(key, ts); return true;
}

function closeReasonModal() {
  const modal = new ModalBuilder().setCustomId('ticket_close_modal').setTitle('Close Ticket');
  const input = new TextInputBuilder()
    .setCustomId('reason').setLabel('Reason for closing (optional)')
    .setStyle(TextInputStyle.Paragraph).setPlaceholder('Add an optional reason…')
    .setRequired(false).setMaxLength(1000);
  return modal.addComponents(new ActionRowBuilder().addComponents(input));
}

function createTicketModal() {
  const modal = new ModalBuilder().setCustomId('create_ticket_modal').setTitle('Create a Ticket');
  const input = new TextInputBuilder()
    .setCustomId('reason').setLabel('How can we help you?')
    .setStyle(TextInputStyle.Paragraph).setPlaceholder('Describe your issue or request in detail…')
    .setRequired(true).setMaxLength(1000);
  return modal.addComponents(new ActionRowBuilder().addComponents(input));
}

function register(client) {
  require('../core/scheduler').register('ticket-delete', actions.performTicketDelete);

  client.on(Events.InteractionCreate, async (interaction) => {
    const id = interaction.customId || '';

    const isButton = interaction.isButton?.() && (id.startsWith('ticket_') || id === 'create_ticket');
    const isStringSelect = interaction.isStringSelectMenu?.() && id.startsWith('ticket_');
    const isUserSelect = interaction.isUserSelectMenu?.() && id.startsWith('ticket_');
    const isModal = interaction.isModalSubmit?.() &&
      (id === 'create_ticket_modal' || id === 'ticket_close_modal' || id.startsWith('ticket_feedback_comment_modal'));

    if (!isButton && !isStringSelect && !isUserSelect && !isModal) return;

    try {
      // ── Buttons ──────────────────────────────────────────────────────────
      if (isButton) {
        const [name, ...args] = id.split(':');
        switch (name) {
          case 'create_ticket': {
            if (!hit(`${interaction.user.id}:create_ticket`)) {
              return interaction.reply({ content: "You're doing that too fast, slow down.", flags: MessageFlags.Ephemeral });
            }
            const cfg = getConfig(interaction.guildId);
            if (openCount(interaction.guildId, interaction.user.id) >= cfg.maxTicketsPerUser) {
              return interaction.reply({ content: `You've reached the max of ${cfg.maxTicketsPerUser} open tickets.`, flags: MessageFlags.Ephemeral });
            }
            return interaction.showModal(createTicketModal());
          }

          case 'ticket_claim':       return actions.claim(interaction);
          case 'ticket_unclaim':     return actions.unclaim(interaction);
          case 'ticket_close':       return actions.promptClose(interaction);
          case 'ticket_close_confirm': return actions.close(interaction, 'Closed by staff.');
          case 'ticket_close_reason': return interaction.showModal(closeReasonModal());
          case 'ticket_close_cancel':
            return interaction.update({
              embeds: [noticeEmbed(interaction, { color: COLORS.muted, title: 'Cancelled', body: 'The ticket was not closed.' })],
              components: [],
            });
          case 'ticket_transcript':  return actions.sendTranscript(interaction);
          case 'ticket_adduser':     return actions.promptAddUser(interaction);
          case 'ticket_removeuser':  return actions.promptRemoveUser(interaction);
          case 'ticket_reopen':      return actions.reopen(interaction);
          case 'ticket_delete':      return actions.deleteTicket(interaction);

          case 'ticket_feedback':        return feedback.submitRating(interaction, args[0], args[1], Number(args[2]));
          case 'ticket_feedback_comment': return feedback.openCommentModal(interaction, args[0], args[1]);
          case 'ticket_feedback_decline': return feedback.declineFeedback(interaction);
          default: return;
        }
      }

      // ── Select menus ─────────────────────────────────────────────────────
      if (isStringSelect && id === 'ticket_priority_select') {
        return actions.setPriority(interaction, interaction.values[0]);
      }
      if (isUserSelect && id === 'ticket_adduser_select')    return actions.handleAddUserSelect(interaction);
      if (isUserSelect && id === 'ticket_removeuser_select') return actions.handleRemoveUserSelect(interaction);

      // ── Modals ───────────────────────────────────────────────────────────
      if (isModal && id === 'create_ticket_modal') return actions.openTicket(interaction);
      if (isModal && id === 'ticket_close_modal') {
        const reason = interaction.fields.getTextInputValue('reason') || 'Closed without a specific reason.';
        return actions.close(interaction, reason);
      }
      if (isModal && id.startsWith('ticket_feedback_comment_modal')) {
        const parts = id.split(':');
        return feedback.saveComment(interaction, parts[1], parts[2]);
      }
    } catch (e) {
      logger.error('[ticket:interaction]', e.message);
      if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: `${EMOJI.warn} Something went wrong.`, flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    }
  });
}

module.exports = { register };
