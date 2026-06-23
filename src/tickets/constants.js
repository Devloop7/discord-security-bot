// src/tickets/constants.js — ticket interaction components + log colors.
//
// Colors/priorities/emojis now live in the global design system (src/ui/theme).
// This file only assembles the button rows, select menus and customIds for the
// ticket UI so every control is visually consistent across the lifecycle.
'use strict';

const {
  ButtonBuilder, ButtonStyle, ActionRowBuilder,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder, UserSelectMenuBuilder,
} = require('discord.js');
const { COLORS, PRIORITY, EMOJI } = require('../ui/theme');

// Per-event colors for ticket log embeds (mapped onto the design palette).
const LOG_COLORS = {
  open:       COLORS.success,
  close:      COLORS.danger,
  reopen:     COLORS.success,
  delete:     COLORS.neutral,
  claim:      COLORS.brand,
  unclaim:    COLORS.warning,
  priority:   COLORS.accent,
  feedback:   COLORS.accent,
  pin:        COLORS.brand,
  unpin:      COLORS.muted,
  adduser:    COLORS.success,
  removeuser: COLORS.warning,
  transcript: COLORS.brand,
};

// ── Open-ticket control panel (multi-row, premium layout) ────────────────────
/**
 * controlRows({ claimed, enablePriority }) → ActionRow[]
 * Row 1: Claim/Unclaim · Close · Transcript
 * Row 2: Add User · Remove User
 * Row 3 (optional): Priority select menu
 */
function controlRows({ claimed = false, enablePriority = true } = {}) {
  const primaryBtn = claimed
    ? new ButtonBuilder().setCustomId('ticket_unclaim').setLabel('Unclaim').setEmoji(EMOJI.unclaim).setStyle(ButtonStyle.Secondary)
    : new ButtonBuilder().setCustomId('ticket_claim').setLabel('Claim').setEmoji(EMOJI.claim).setStyle(ButtonStyle.Primary);

  const row1 = new ActionRowBuilder().addComponents(
    primaryBtn,
    new ButtonBuilder().setCustomId('ticket_close').setLabel('Close').setEmoji(EMOJI.close).setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('ticket_transcript').setLabel('Transcript').setEmoji(EMOJI.transcript).setStyle(ButtonStyle.Secondary),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_adduser').setLabel('Add User').setEmoji(EMOJI.addUser).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ticket_removeuser').setLabel('Remove User').setEmoji(EMOJI.removeUser).setStyle(ButtonStyle.Secondary),
  );

  const rows = [row1, row2];

  if (enablePriority) {
    const select = new StringSelectMenuBuilder()
      .setCustomId('ticket_priority_select')
      .setPlaceholder(`${EMOJI.priority}  Set priority…`)
      .addOptions(
        ['urgent', 'high', 'medium', 'low', 'none'].map((key) => {
          const p = PRIORITY[key];
          return new StringSelectMenuOptionBuilder()
            .setLabel(p.label)
            .setValue(key)
            .setEmoji(p.emoji);
        }),
      );
    rows.push(new ActionRowBuilder().addComponents(select));
  }

  return rows;
}

// ── Closed-ticket footer controls ────────────────────────────────────────────
/** closedRows() → ActionRow[] — Reopen · Transcript · Delete */
function closedRows() {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_reopen').setLabel('Reopen').setEmoji(EMOJI.reopen).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('ticket_transcript').setLabel('Transcript').setEmoji(EMOJI.transcript).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ticket_delete').setLabel('Delete').setEmoji(EMOJI.delete).setStyle(ButtonStyle.Danger),
  )];
}

// ── Close confirmation (ephemeral) ───────────────────────────────────────────
/** closeConfirmRow() → ActionRow[] — Confirm · Add reason · Cancel */
function closeConfirmRow() {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_close_confirm').setLabel('Confirm Close').setEmoji(EMOJI.close).setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('ticket_close_reason').setLabel('Add Reason').setEmoji(EMOJI.reason).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ticket_close_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
  )];
}

// ── User pickers (ephemeral) for add/remove ──────────────────────────────────
function addUserRow() {
  return [new ActionRowBuilder().addComponents(
    new UserSelectMenuBuilder().setCustomId('ticket_adduser_select').setPlaceholder('Select a member to add…').setMaxValues(1),
  )];
}
function removeUserRow() {
  return [new ActionRowBuilder().addComponents(
    new UserSelectMenuBuilder().setCustomId('ticket_removeuser_select').setPlaceholder('Select a member to remove…').setMaxValues(1),
  )];
}

// ── Feedback survey (DM) ─────────────────────────────────────────────────────
/**
 * feedbackRows(guildId, channelId)
 * Row 1: five star buttons · Row 2: Add Comment + No thanks
 */
function feedbackRows(guildId, channelId) {
  const stars = [1, 2, 3, 4, 5].map((n) =>
    new ButtonBuilder()
      .setCustomId(`ticket_feedback:${guildId}:${channelId}:${n}`)
      .setLabel(String(n))
      .setEmoji(EMOJI.star)
      .setStyle(n === 5 ? ButtonStyle.Primary : ButtonStyle.Secondary),
  );
  const row1 = new ActionRowBuilder().addComponents(...stars);
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ticket_feedback_comment:${guildId}:${channelId}`).setLabel('Add Comment').setEmoji('✍️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`ticket_feedback_decline:${guildId}:${channelId}`).setLabel('No thanks').setStyle(ButtonStyle.Secondary),
  );
  return [row1, row2];
}

// ── Panel "Create Ticket" button ─────────────────────────────────────────────
function panelComponents(buttonLabel = 'Create Ticket') {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('create_ticket').setLabel(buttonLabel).setEmoji(EMOJI.ticket).setStyle(ButtonStyle.Primary),
  )];
}

module.exports = {
  LOG_COLORS, PRIORITY,
  controlRows, closedRows, closeConfirmRow, addUserRow, removeUserRow,
  feedbackRows, panelComponents,
};
