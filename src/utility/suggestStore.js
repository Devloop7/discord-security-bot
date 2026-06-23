// src/utility/suggestStore.js — persistence + rendering for /suggest.
// Keyed by the suggestion MESSAGE id (button clicks map back via interaction.message.id).
// Data shape (suggestions.json): { "<messageId>": { guildId, channelId, authorId,
//   text, up: ["<userId>"], down: ["<userId>"] } }
'use strict';

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { COLORS, EMOJI } = require('../ui/theme');
const store = require('../core/store');

const FILE = 'suggestions.json';

function all() { return store.read(FILE, {}); }
function getSuggestion(messageId) { return all()[messageId] || null; }

function addSuggestion(messageId, { guildId, channelId, authorId, text }) {
  return store.mutate(FILE, (d) => {
    d[messageId] = { guildId, channelId, authorId, text, up: [], down: [] };
    return d[messageId];
  }, {});
}

// dir: 'up' | 'down'. A user can only be in one list; clicking their current side
// removes the vote (toggle). Returns the updated suggestion, or null if missing.
function toggleVote(messageId, userId, dir) {
  return store.mutate(FILE, (d) => {
    const s = d[messageId];
    if (!s) return null;
    const same = dir === 'up' ? s.up : s.down;
    const other = dir === 'up' ? s.down : s.up;
    const oi = other.indexOf(userId);
    if (oi >= 0) other.splice(oi, 1);
    const si = same.indexOf(userId);
    if (si >= 0) same.splice(si, 1); else same.push(userId);
    return s;
  }, {});
}

// ── pure helper (unit-tested) ────────────────────────────────────────────────
function score(s) { return s.up.length - s.down.length; }

// ── rendering ────────────────────────────────────────────────────────────────
function renderEmbed(s, authorTag) {
  const up = s.up.length;
  const down = s.down.length;
  const sc = score(s);
  const embed = new EmbedBuilder()
    .setColor(COLORS.accent)
    .setAuthor({ name: 'Community Suggestion' })
    .setDescription(`${EMOJI.bulb}  ${s.text}`)
    .addFields(
      { name: 'Upvotes', value: `${EMOJI.up} **${up}**`, inline: true },
      { name: 'Downvotes', value: `${EMOJI.down} **${down}**`, inline: true },
      { name: 'Score', value: `${sc > 0 ? '+' : ''}${sc}`, inline: true },
    )
    .setTimestamp();
  if (authorTag) embed.setFooter({ text: `Suggested by ${authorTag}` });
  return embed;
}

function renderRows(disabled = false) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('suggest:up').setLabel('Upvote').setEmoji(EMOJI.up).setStyle(ButtonStyle.Success).setDisabled(disabled),
    new ButtonBuilder().setCustomId('suggest:down').setLabel('Downvote').setEmoji(EMOJI.down).setStyle(ButtonStyle.Danger).setDisabled(disabled),
  )];
}

module.exports = { FILE, getSuggestion, addSuggestion, toggleVote, score, renderEmbed, renderRows };
