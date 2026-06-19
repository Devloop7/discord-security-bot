// src/tickets/feedback.js — post-close feedback survey via DM.
'use strict';

const {
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  MessageFlags,
} = require('discord.js');

const { feedbackRows } = require('./constants');
const { getTicket, updateTicket } = require('../core/ticketStore');
const { logTicketEvent } = require('./log');
const logger = require('../core/logger');

// ---------------------------------------------------------------------------
// sendSurvey
// ---------------------------------------------------------------------------

/**
 * DM the user a star-rating survey after their ticket is closed.
 * Silently no-ops if the user has DMs disabled.
 *
 * @param {User}   user       — Discord user object of the ticket opener
 * @param {string} guildId    — guild the ticket belonged to
 * @param {string} channelId  — ticket channel ID (used in button customIds)
 */
async function sendSurvey(user, guildId, channelId) {
  try {
    const embed = new EmbedBuilder()
      .setTitle('⭐ How was your support experience?')
      .setDescription(
        'Tap a star to rate the support you received. Your feedback helps us improve!',
      )
      .setColor(0xF1C40F)
      .setFooter({ text: 'Your feedback helps us improve.' });

    await user.send({
      embeds: [embed],
      components: feedbackRows(guildId, channelId),
    });
  } catch (e) {
    logger.debug('[ticket:feedback] could not DM survey to user:', e.message);
  }
}

// ---------------------------------------------------------------------------
// submitRating
// ---------------------------------------------------------------------------

/**
 * Handle a star-button click.  Updates the stored rating and logs it.
 *
 * @param {ButtonInteraction} interaction
 * @param {string} guildId
 * @param {string} channelId
 * @param {number} n  — rating 1-5
 */
async function submitRating(interaction, guildId, channelId, n) {
  const ticket = getTicket(channelId);

  // Only the ticket creator may rate.
  if (ticket && interaction.user.id !== ticket.userId) {
    return interaction.reply({
      content: 'Only the ticket creator can rate.',
      flags: MessageFlags.Ephemeral,
    });
  }

  // Guard against double-submission.
  if (ticket?.feedback?.rating) {
    return interaction.reply({
      content: 'You already submitted feedback. Thank you!',
      flags: MessageFlags.Ephemeral,
    });
  }

  // Persist rating.
  updateTicket(channelId, {
    feedback: {
      ...(ticket?.feedback || {}),
      rating: n,
      submittedAt: Date.now(),
    },
  });

  // Log to guild log channel.
  const guild = await interaction.client.guilds.fetch(guildId).catch(() => null);
  if (guild) {
    await logTicketEvent(guild, 'feedback', {
      fields: [
        {
          name: 'Ticket',
          value: ticket?.number ? `#${ticket.number}` : channelId,
          inline: true,
        },
        {
          name: 'Rating',
          value: `${'⭐'.repeat(n)} (${n}/5)`,
          inline: true,
        },
      ],
    });
  }

  await interaction.update({
    content: `Thanks for rating us ${'⭐'.repeat(n)} (${n}/5)!`,
    embeds: [],
    components: [],
  });
}

// ---------------------------------------------------------------------------
// openCommentModal
// ---------------------------------------------------------------------------

/**
 * Show a modal so the user can type a written comment.
 *
 * @param {ButtonInteraction} interaction
 * @param {string} guildId
 * @param {string} channelId
 */
async function openCommentModal(interaction, guildId, channelId) {
  const modal = new ModalBuilder()
    .setCustomId(`ticket_feedback_comment_modal:${guildId}:${channelId}`)
    .setTitle('Add a Comment');

  const commentInput = new TextInputBuilder()
    .setCustomId('feedback_comment')
    .setLabel('Your feedback')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Share what went well or how we can improve...')
    .setRequired(true)
    .setMaxLength(1000);

  modal.addComponents(new ActionRowBuilder().addComponents(commentInput));

  return interaction.showModal(modal);
}

// ---------------------------------------------------------------------------
// saveComment
// ---------------------------------------------------------------------------

/**
 * Handle submission of the feedback-comment modal.
 *
 * @param {ModalSubmitInteraction} interaction
 * @param {string} guildId
 * @param {string} channelId
 */
async function saveComment(interaction, guildId, channelId) {
  const comment = interaction.fields.getTextInputValue('feedback_comment');
  const ticket = getTicket(channelId);

  updateTicket(channelId, {
    feedback: {
      ...(ticket?.feedback || {}),
      comment,
      commentSubmittedAt: Date.now(),
    },
  });

  // Log to guild log channel.
  const guild = await interaction.client.guilds.fetch(guildId).catch(() => null);
  if (guild) {
    await logTicketEvent(guild, 'feedback', {
      fields: [
        {
          name: 'Ticket',
          value: ticket?.number ? `#${ticket.number}` : channelId,
          inline: true,
        },
        {
          name: 'Comment',
          value: comment.slice(0, 1024),
          inline: false,
        },
      ],
    });
  }

  await interaction.reply({
    content: '📝 Thanks for your feedback!',
    flags: MessageFlags.Ephemeral,
  });
}

// ---------------------------------------------------------------------------
// declineFeedback
// ---------------------------------------------------------------------------

/**
 * Handle the "No thanks" button — clear the survey message.
 *
 * @param {ButtonInteraction} interaction
 */
async function declineFeedback(interaction) {
  await interaction.update({
    content: '👋 No problem! You can always reach out again if you need support.',
    embeds: [],
    components: [],
  });
}

// ---------------------------------------------------------------------------

module.exports = { sendSurvey, submitRating, openCommentModal, saveComment, declineFeedback };
