// src/tickets/constants.js — colors, priority map, customIds, emojis, button builders.
const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');

const PRIORITY = {
  none:   { emoji: '⚪', label: 'None',   color: '#95A5A6' },
  low:    { emoji: '🟢', label: 'Low',    color: '#2ECC71' },
  medium: { emoji: '🟡', label: 'Medium', color: '#F1C40F' },
  high:   { emoji: '🔴', label: 'High',   color: '#E74C3C' },
  urgent: { emoji: '🚨', label: 'Urgent', color: '#E91E63' },
};

const COLORS = {
  info:    '#3498DB',
  open:    '#2ECC71',
  closed:  '#E74C3C',
  claim:   '#2ECC71',
  unclaim: '#F39C12',
  reopen:  '#2ECC71',
};

const LOG_COLORS = {
  open:     0x5865F2,
  close:    0xED4245,
  reopen:   0x2ECC71,
  delete:   0x8B0000,
  claim:    0x5865F2,
  unclaim:  0xFAA61A,
  priority: 0x9B59B6,
  feedback: 0x57F287,
};

/**
 * controlRow({ claimed, enablePriority })
 * Buttons: Claim/Claimed, Pin, Close [, Low, High if enablePriority]
 */
function controlRow({ claimed = false, enablePriority = true } = {}) {
  const claimBtn = new ButtonBuilder()
    .setCustomId('ticket_claim')
    .setLabel(claimed ? 'Claimed' : 'Claim')
    .setEmoji('🙋')
    .setStyle(claimed ? ButtonStyle.Secondary : ButtonStyle.Primary)
    .setDisabled(claimed);

  const pinBtn = new ButtonBuilder()
    .setCustomId('ticket_pin')
    .setLabel('Pin')
    .setEmoji('📌')
    .setStyle(ButtonStyle.Secondary);

  const closeBtn = new ButtonBuilder()
    .setCustomId('ticket_close')
    .setLabel('Close')
    .setEmoji('🔒')
    .setStyle(ButtonStyle.Danger);

  const row = new ActionRowBuilder().addComponents(claimBtn, pinBtn, closeBtn);

  if (enablePriority) {
    const lowBtn = new ButtonBuilder()
      .setCustomId('ticket_priority:low')
      .setLabel('Low')
      .setEmoji('🟢')
      .setStyle(ButtonStyle.Secondary);

    const highBtn = new ButtonBuilder()
      .setCustomId('ticket_priority:high')
      .setLabel('High')
      .setEmoji('🔴')
      .setStyle(ButtonStyle.Danger);

    row.addComponents(lowBtn, highBtn);
  }

  return row;
}

/**
 * closedRow()
 * Buttons: Reopen, Delete
 */
function closedRow() {
  const reopenBtn = new ButtonBuilder()
    .setCustomId('ticket_reopen')
    .setLabel('Reopen')
    .setEmoji('🔓')
    .setStyle(ButtonStyle.Success);

  const deleteBtn = new ButtonBuilder()
    .setCustomId('ticket_delete')
    .setLabel('Delete')
    .setEmoji('🗑️')
    .setStyle(ButtonStyle.Danger);

  return new ActionRowBuilder().addComponents(reopenBtn, deleteBtn);
}

/**
 * feedbackRows(guildId, channelId)
 * Row 1: five star buttons (⭐ 1..⭐ 5)
 * Row 2: Add Comment + No thanks
 */
function feedbackRows(guildId, channelId) {
  const starButtons = [1, 2, 3, 4, 5].map((n) =>
    new ButtonBuilder()
      .setCustomId(`ticket_feedback:${guildId}:${channelId}:${n}`)
      .setLabel(`⭐ ${n}`)
      .setStyle(n < 5 ? ButtonStyle.Secondary : ButtonStyle.Primary),
  );

  const row1 = new ActionRowBuilder().addComponents(...starButtons);

  const commentBtn = new ButtonBuilder()
    .setCustomId(`ticket_feedback_comment:${guildId}:${channelId}`)
    .setLabel('Add Comment')
    .setEmoji('✍️')
    .setStyle(ButtonStyle.Secondary);

  const declineBtn = new ButtonBuilder()
    .setCustomId(`ticket_feedback_decline:${guildId}:${channelId}`)
    .setLabel('No thanks')
    .setEmoji('❌')
    .setStyle(ButtonStyle.Secondary);

  const row2 = new ActionRowBuilder().addComponents(commentBtn, declineBtn);

  return [row1, row2];
}

/**
 * panelComponents(buttonLabel)
 * Row with a single Create Ticket button.
 */
function panelComponents(buttonLabel = 'Create Ticket') {
  const btn = new ButtonBuilder()
    .setCustomId('create_ticket')
    .setLabel(buttonLabel)
    .setEmoji('📩')
    .setStyle(ButtonStyle.Primary);

  return new ActionRowBuilder().addComponents(btn);
}

module.exports = { PRIORITY, COLORS, LOG_COLORS, controlRow, closedRow, feedbackRows, panelComponents };
