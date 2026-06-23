// src/tickets/embeds.js — every ticket-facing embed, built from the design system.
//
// All ticket cards are rebuilt from the ticket record on demand (no more editing
// embeds by string-matching field names). This keeps the visuals consistent and
// makes claim/priority/close/reopen a single "re-render" instead of fragile
// per-field surgery.
'use strict';

const { baseEmbed, COLORS, PRIORITY, STATUS, EMOJI, brandIcon } = require('../ui/theme');
const { normalizeText } = require('../core/format');

// Zero-width space — used as an empty grid-spacer field (Discord rejects truly
// empty field names/values). Built from a code point to keep the source ASCII.
const ZWSP = String.fromCharCode(0x200b);

function priorityOf(ticket) { return PRIORITY[ticket?.priority] || PRIORITY.none; }
function statusOf(ticket) {
  if (ticket?.status === 'closed') return STATUS.closed;
  if (ticket?.claimedBy) return STATUS.claimed;
  return STATUS.open;
}

// ms → "2d 3h", "4h 12m", "8m", "<1m"
function humanizeDuration(ms) {
  if (!ms || ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m`;
  return '<1m';
}

function avatarOf(opener) {
  try {
    return opener?.displayAvatarURL?.({ size: 256 })
      || opener?.user?.displayAvatarURL?.({ size: 256 })
      || null;
  } catch { return null; }
}

// ── Ticket creation panel ────────────────────────────────────────────────────
function buildPanelEmbed(scope, cfg = {}) {
  const guild = scope?.guild || scope;
  const intro = (cfg.panelMessage && normalizeText(cfg.panelMessage))
    || 'Need help or have a request? Open a private ticket and our team will assist you as soon as possible.';
  const label = cfg.buttonLabel || 'Create Ticket';

  const e = baseEmbed(scope, { color: COLORS.brand, timestamp: false })
    .setAuthor({ name: 'Support Center', iconURL: brandIcon(scope) || undefined })
    .setTitle(`${EMOJI.ticket}  Open a Support Ticket`)
    .setDescription(
      `${intro}\n\n` +
      `**How it works**\n` +
      `${EMOJI.arrow} Click **${label}** below\n` +
      `${EMOJI.arrow} Describe your request in the short form\n` +
      `${EMOJI.arrow} A private channel opens for you and our staff`,
    );

  const icon = guild?.iconURL?.({ size: 256 });
  if (icon) e.setThumbnail(icon);
  return e;
}

// ── Ticket open / welcome card (the pinned message) ──────────────────────────
function buildTicketEmbed(scope, ticket, opts = {}) {
  const opener = opts.opener || null;
  const p = priorityOf(ticket);
  const st = statusOf(ticket);
  const num = ticket.number || '—';
  const createdTs = Math.floor((ticket.createdAt || Date.now()) / 1000);
  const color = ticket.status === 'closed' ? STATUS.closed.color : p.color;

  const e = baseEmbed(scope, { color, footer: `Ticket #${num}`, timestamp: false })
    .setTitle(`${EMOJI.ticket}  Ticket #${num}`)
    .setDescription(
      `Welcome <@${ticket.userId}> ${EMOJI.wave}\n` +
      'Thanks for reaching out — a team member will be with you shortly. ' +
      'Please share as much detail as you can below.',
    )
    .addFields(
      { name: `${EMOJI.owner} Opened by`, value: `<@${ticket.userId}>`, inline: true },
      { name: 'Status', value: `${st.emoji} ${st.label}`, inline: true },
      { name: `${EMOJI.priority} Priority`, value: `${p.emoji} ${p.label}`, inline: true },
      { name: `${EMOJI.staff} Claimed by`, value: ticket.claimedBy ? `<@${ticket.claimedBy}>` : '*Unclaimed*', inline: true },
      { name: `${EMOJI.clock} Opened`, value: `<t:${createdTs}:R>`, inline: true },
      { name: ZWSP, value: ZWSP, inline: true },
    );

  if (ticket.reason) {
    e.addFields({ name: `${EMOJI.reason} Reason`, value: String(ticket.reason).slice(0, 1024), inline: false });
  }

  const avatar = avatarOf(opener);
  if (avatar) e.setThumbnail(avatar);
  return e;
}

// ── Generic inline notice (claim, priority, add user, etc.) ──────────────────
function noticeEmbed(scope, { color = COLORS.brand, title, body, timestamp = false } = {}) {
  const e = baseEmbed(scope, { color, timestamp });
  if (title) e.setTitle(title);
  if (body) e.setDescription(body);
  return e;
}

// ── Close confirmation (ephemeral) ───────────────────────────────────────────
function confirmCloseEmbed(scope) {
  return baseEmbed(scope, { color: COLORS.warning, timestamp: false })
    .setTitle(`${EMOJI.close}  Close this ticket?`)
    .setDescription(
      'This locks the ticket and removes the member\'s access. ' +
      'You can reopen or generate a transcript afterwards.',
    );
}

// ── Closed card (posted in-channel after closing) ────────────────────────────
function closedEmbed(scope, ticket, { byId, reason } = {}) {
  const num = ticket.number || '—';
  const openedFor = ticket.closedAt && ticket.createdAt
    ? humanizeDuration(ticket.closedAt - ticket.createdAt)
    : null;

  const e = baseEmbed(scope, { color: STATUS.closed.color, footer: `Ticket #${num}` })
    .setTitle(`${EMOJI.close}  Ticket Closed`)
    .setDescription(`This ticket has been closed by <@${byId}>.`)
    .addFields(
      { name: `${EMOJI.reason} Reason`, value: String(reason || 'No reason provided').slice(0, 1024), inline: false },
    );
  if (openedFor) e.addFields({ name: `${EMOJI.clock} Open for`, value: openedFor, inline: true });
  return e;
}

// ── DM sent to the opener on close ───────────────────────────────────────────
function dmClosedEmbed(scope, ticket, { reason, byTag, guildName } = {}) {
  const num = ticket.number || '—';
  return baseEmbed(scope, { color: COLORS.brand, footer: guildName || undefined })
    .setTitle(`${EMOJI.ticket}  Your ticket was closed`)
    .setDescription(`Ticket **#${num}**${guildName ? ` in **${guildName}**` : ''} has been closed.`)
    .addFields(
      { name: `${EMOJI.reason} Reason`, value: String(reason || 'No reason provided').slice(0, 1024), inline: false },
      { name: `${EMOJI.staff} Closed by`, value: byTag || '—', inline: true },
    );
}

// ── Delete countdown ─────────────────────────────────────────────────────────
function deleteEmbed(scope, seconds = 5) {
  return baseEmbed(scope, { color: STATUS.closed.color, timestamp: false })
    .setTitle(`${EMOJI.delete}  Deleting ticket`)
    .setDescription(`This channel will be permanently deleted in **${seconds} seconds**. A transcript is being archived.`);
}

// ── Transcript delivery (in the transcript channel) ──────────────────────────
function transcriptEmbed(scope, ticket, { channelName, byTag, messageCount } = {}) {
  const num = ticket?.number || '—';
  const handled = ticket?.claimedBy ? `<@${ticket.claimedBy}>` : '*Unclaimed*';
  const duration = ticket?.closedAt && ticket?.createdAt
    ? humanizeDuration(ticket.closedAt - ticket.createdAt)
    : (ticket?.createdAt ? humanizeDuration(Date.now() - ticket.createdAt) : '—');
  const rating = ticket?.feedback?.rating ? `${EMOJI.star.repeat(ticket.feedback.rating)} (${ticket.feedback.rating}/5)` : '—';

  return baseEmbed(scope, { color: COLORS.brand, footer: `Ticket #${num}` })
    .setTitle(`${EMOJI.transcript}  Ticket Transcript`)
    .setDescription(`Archived transcript for **#${num}** (${channelName ? `\`${channelName}\`` : 'ticket'}).`)
    .addFields(
      { name: `${EMOJI.owner} Opened by`, value: ticket?.userId ? `<@${ticket.userId}>` : '—', inline: true },
      { name: `${EMOJI.staff} Handled by`, value: handled, inline: true },
      { name: `${EMOJI.clock} Duration`, value: duration, inline: true },
      { name: 'Messages', value: String(messageCount ?? '—'), inline: true },
      { name: `${EMOJI.star} Rating`, value: rating, inline: true },
      { name: 'Closed by', value: byTag || '—', inline: true },
    );
}

module.exports = {
  buildPanelEmbed,
  buildTicketEmbed,
  noticeEmbed,
  confirmCloseEmbed,
  closedEmbed,
  dmClosedEmbed,
  deleteEmbed,
  transcriptEmbed,
  humanizeDuration,
  priorityOf,
  statusOf,
};
