// src/utility/pollStore.js — persistence + rendering for /poll.
// Polls are keyed by the poll MESSAGE id, so a button click maps back to its poll
// via interaction.message.id (no need to encode the poll id in the customId).
// Data shape (polls.json): { "<messageId>": { guildId, channelId, question,
//   options: [string], votes: { "<userId>": optionIndex }, endsAt: ms|null, closed } }
'use strict';

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const store = require('../core/store');

const FILE = 'polls.json';
const BAR_LEN = 12;

function all() { return store.read(FILE, {}); }
function getPoll(messageId) { return all()[messageId] || null; }

function createPoll(messageId, { guildId, channelId, question, options, endsAt = null }) {
  return store.mutate(FILE, (d) => {
    d[messageId] = { guildId, channelId, question, options, votes: {}, endsAt, closed: false };
    return d[messageId];
  }, {});
}

// One vote per user. Clicking the option you already picked removes your vote (toggle).
// Returns the updated poll, or null if it doesn't exist / is closed.
function vote(messageId, userId, optionIndex) {
  return store.mutate(FILE, (d) => {
    const p = d[messageId];
    if (!p || p.closed) return null;
    if (optionIndex < 0 || optionIndex >= p.options.length) return p;
    if (p.votes[userId] === optionIndex) delete p.votes[userId];
    else p.votes[userId] = optionIndex;
    return p;
  }, {});
}

function closePoll(messageId) {
  return store.mutate(FILE, (d) => {
    if (d[messageId]) d[messageId].closed = true;
    return d[messageId] || null;
  }, {});
}

// ── pure helpers (unit-tested) ──────────────────────────────────────────────
function tally(poll) {
  const counts = poll.options.map(() => 0);
  for (const idx of Object.values(poll.votes)) if (counts[idx] !== undefined) counts[idx] += 1;
  return counts;
}
function totalVotes(poll) { return Object.keys(poll.votes).length; }

// ── rendering ────────────────────────────────────────────────────────────────
function renderEmbed(poll) {
  const counts = tally(poll);
  const total = totalVotes(poll);
  const lines = poll.options.map((opt, i) => {
    const n = counts[i];
    const pct = total ? Math.round((n / total) * 100) : 0;
    const filled = Math.round((pct / 100) * BAR_LEN);
    const bar = '█'.repeat(filled) + '░'.repeat(BAR_LEN - filled);
    return `**${i + 1}.** ${opt}\n\`${bar}\` ${pct}% (${n})`;
  });
  const embed = new EmbedBuilder()
    .setTitle(`📊 ${poll.question}`)
    .setDescription(lines.join('\n\n'))
    .setColor(poll.closed ? 0x95A5A6 : 0x5865F2)
    .setFooter({ text: poll.closed ? `Poll closed • ${total} vote(s)` : `${total} vote(s)` });
  if (!poll.closed && poll.endsAt) {
    embed.addFields({ name: '​', value: `Closes <t:${Math.floor(poll.endsAt / 1000)}:R>` });
  }
  return embed;
}

function renderRows(poll, { disabled = false } = {}) {
  const row = new ActionRowBuilder();
  poll.options.forEach((_, i) => {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`poll:${i}`)
        .setLabel(String(i + 1))
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disabled || poll.closed),
    );
  });
  return [row];
}

module.exports = { FILE, getPoll, createPoll, vote, closePoll, tally, totalVotes, renderEmbed, renderRows };
