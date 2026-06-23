// src/tickets/feedback.js — post-close feedback survey via DM (branded).
'use strict';

const {
  ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags,
} = require('discord.js');

const { feedbackRows } = require('./constants');
const { noticeEmbed } = require('./embeds');
const { baseEmbed, COLORS, EMOJI } = require('../ui/theme');
const { getTicket, updateTicket } = require('../core/ticketStore');
const { logTicketEvent } = require('./log');
const logger = require('../core/logger');

/** DM the opener a star-rating survey after their ticket closes. */
async function sendSurvey(user, guildId, channelId) {
  try {
    const embed = baseEmbed(user, { color: COLORS.accent, timestamp: false })
      .setTitle(`${EMOJI.star}  How was your support experience?`)
      .setDescription('Tap a star below to rate the help you received. Your feedback helps us improve!');
    await user.send({ embeds: [embed], components: feedbackRows(guildId, channelId) });
  } catch (e) {
    logger.debug('[ticket:feedback] could not DM survey:', e.message);
  }
}

/** Handle a star-button click (rating 1-5). */
async function submitRating(interaction, guildId, channelId, n) {
  const ticket = getTicket(channelId);

  if (ticket && interaction.user.id !== ticket.userId) {
    return interaction.reply({ content: 'Only the ticket creator can rate.', flags: MessageFlags.Ephemeral });
  }
  if (ticket?.feedback?.rating) {
    return interaction.reply({ content: 'You already submitted feedback. Thank you!', flags: MessageFlags.Ephemeral });
  }

  updateTicket(channelId, { feedback: { ...(ticket?.feedback || {}), rating: n, submittedAt: Date.now() } });

  const guild = await interaction.client.guilds.fetch(guildId).catch(() => null);
  if (guild) {
    await logTicketEvent(guild, 'feedback', {
      fields: [
        { name: 'Ticket', value: ticket?.number ? `#${ticket.number}` : channelId, inline: true },
        { name: 'Rating', value: `${EMOJI.star.repeat(n)} (${n}/5)`, inline: true },
      ],
    });
  }

  const thanks = noticeEmbed(interaction, {
    color: COLORS.accent,
    title: `${EMOJI.star.repeat(n)}`,
    body: `Thanks for rating us **${n}/5**! Want to add a few words?`,
  });
  await interaction.update({ embeds: [thanks], components: feedbackRows(guildId, channelId).slice(1) });
}

/** Show the comment modal. */
async function openCommentModal(interaction, guildId, channelId) {
  const modal = new ModalBuilder()
    .setCustomId(`ticket_feedback_comment_modal:${guildId}:${channelId}`)
    .setTitle('Add a Comment');
  const input = new TextInputBuilder()
    .setCustomId('feedback_comment').setLabel('Your feedback')
    .setStyle(TextInputStyle.Paragraph).setPlaceholder('Share what went well or how we can improve…')
    .setRequired(true).setMaxLength(1000);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return interaction.showModal(modal);
}

/** Persist the comment from the modal. */
async function saveComment(interaction, guildId, channelId) {
  const comment = interaction.fields.getTextInputValue('feedback_comment');
  const ticket = getTicket(channelId);

  updateTicket(channelId, { feedback: { ...(ticket?.feedback || {}), comment, commentSubmittedAt: Date.now() } });

  const guild = await interaction.client.guilds.fetch(guildId).catch(() => null);
  if (guild) {
    await logTicketEvent(guild, 'feedback', {
      fields: [
        { name: 'Ticket', value: ticket?.number ? `#${ticket.number}` : channelId, inline: true },
        { name: 'Comment', value: comment.slice(0, 1024), inline: false },
      ],
    });
  }

  await interaction.reply({
    embeds: [noticeEmbed(interaction, { color: COLORS.success, title: `${EMOJI.success}  Thank you!`, body: 'Your feedback has been recorded.' })],
    flags: MessageFlags.Ephemeral,
  });
}

/** "No thanks" — clear the survey message. */
async function declineFeedback(interaction) {
  await interaction.update({
    embeds: [noticeEmbed(interaction, { color: COLORS.muted, title: `${EMOJI.wave}  No problem!`, body: 'You can always reach out again if you need support.' })],
    components: [],
  });
}

module.exports = { sendSurvey, submitRating, openCommentModal, saveComment, declineFeedback };
