// src/ui/theme.js — the single source of truth for the bot's visual language.
//
// Every embed, button row, color and footer in the bot is built from here so the
// whole product looks like one cohesive premium system instead of a pile of
// modules that each invented their own colors. Import COLORS/EMOJI/PRIORITY for
// values, and use baseEmbed()/brandFooter() so footers + timestamps stay uniform.
//
// Design language: "Indigo / Violet premium". A refined indigo primary with
// muted, non-neon semantic colors and a seamless dark neutral for secondary
// surfaces — the palette top-tier bots (Ticket Tool, Sapphire) use to read as a
// real SaaS product rather than a generic free bot.
'use strict';

const { EmbedBuilder } = require('discord.js');

// ── Core palette ────────────────────────────────────────────────────────────
const COLORS = {
  brand:    0x6366F1, // indigo-500 — primary accent
  brandDark:0x4F46E5, // indigo-600 — pressed / deep
  accent:   0x8B5CF6, // violet-500 — highlights, feedback
  success:  0x3BA55D, // refined green (not neon)
  danger:   0xE03E52, // alert red
  warning:  0xF59E0B, // amber
  info:     0x6366F1, // == brand, semantic alias
  neutral:  0x2B2D31, // "seamless" — blends into Discord dark bg
  muted:    0x9096A2, // slate text-ish
};

// Brand color used as the default for any embed that doesn't specify one.
const BRAND = COLORS.brand;

// ── Priority scale (cohesive, premium — not the old flat material colors) ────
const PRIORITY = {
  none:   { key: 'none',   emoji: '⚪', label: 'None',   color: 0x6E7687 },
  low:    { key: 'low',    emoji: '🟢', label: 'Low',    color: 0x3BA55D },
  medium: { key: 'medium', emoji: '🟡', label: 'Medium', color: 0xF59E0B },
  high:   { key: 'high',   emoji: '🟠', label: 'High',   color: 0xF0682D },
  urgent: { key: 'urgent', emoji: '🔴', label: 'Urgent', color: 0xE03E52 },
};

// ── Status scale ─────────────────────────────────────────────────────────────
const STATUS = {
  open:    { emoji: '🟢', label: 'Open',    color: COLORS.success },
  claimed: { emoji: '🟣', label: 'Claimed', color: COLORS.brand },
  closed:  { emoji: '🔴', label: 'Closed',  color: COLORS.danger },
  archived:{ emoji: '📦', label: 'Archived',color: COLORS.neutral },
};

// ── Curated icon set — used consistently across every surface ────────────────
const EMOJI = {
  // tickets
  ticket: '🎫', owner: '👤', staff: '🛡️', clock: '🕐', calendar: '🗓️',
  reason: '📝', priority: '🚩', transcript: '📄', addUser: '➕', removeUser: '➖',
  claim: '✋', unclaim: '🙌', close: '🔒', reopen: '🔓', delete: '🗑️', pin: '📌',
  // feedback / status
  star: '⭐', success: '✅', warn: '⚠️', error: '⛔', info: 'ℹ️', loading: '⏳',
  // posts / logs
  announce: '📣', note: '🗒️', sparkle: '✦', shield: '🛡️', wave: '👋',
  bulb: '💡', up: '👍', down: '👎',
  // typographic
  arrow: '›', bullet: '•', dot: '·',
};

// A subtle divider line for separating sections inside a description.
// Kept short + light so it reads as premium, not as a wall of bars.
const DIVIDER = '————————————————';

// ── Footer / branding ────────────────────────────────────────────────────────
// Resolves the bot's identity from any Discord object that carries a client
// (guild, interaction, channel, message, or the client itself). The footer is
// the bot's own name + avatar so every message reads as one branded product.
function resolveClient(scope) {
  if (!scope) return null;
  if (scope.user && scope.application) return scope; // looks like a Client
  return scope.client || null;
}

function brandName(scope) {
  const client = resolveClient(scope);
  return client?.user?.username || 'Support';
}

function brandIcon(scope) {
  const client = resolveClient(scope);
  try { return client?.user?.displayAvatarURL?.({ size: 128 }) || null; }
  catch { return null; }
}

/**
 * brandFooter(scope, extra?) → { text, iconURL }
 * `extra` is appended after a separator, e.g. "MyBot • Ticket #014".
 */
function brandFooter(scope, extra) {
  const name = brandName(scope);
  const text = extra ? `${name}  ${EMOJI.bullet}  ${extra}` : name;
  const iconURL = brandIcon(scope);
  return iconURL ? { text, iconURL } : { text };
}

/**
 * baseEmbed(scope, opts?) → EmbedBuilder
 * Pre-applies the brand color, branded footer and a timestamp so callers only
 * set the content. Pass { color } to override, { footer } for extra footer text,
 * { timestamp:false } to omit the timestamp.
 */
function baseEmbed(scope, opts = {}) {
  const { color = BRAND, footer, timestamp = true } = opts;
  const embed = new EmbedBuilder()
    .setColor(color)
    .setFooter(brandFooter(scope, footer));
  if (timestamp) embed.setTimestamp();
  return embed;
}

// ── Small text helpers (keep formatting consistent across modules) ───────────
/** Inline "label: value" line with a leading icon. */
function line(icon, label, value) {
  return `${icon}  **${label}**  ${EMOJI.arrow}  ${value}`;
}
/** A field object with sane defaults. */
function field(name, value, inline = false) {
  return { name, value: String(value), inline };
}

module.exports = {
  COLORS, BRAND, PRIORITY, STATUS, EMOJI, DIVIDER,
  brandFooter, brandName, brandIcon, baseEmbed, line, field,
};
