// src/core/format/autoEmbed.js — render a parsed block model into Discord embeds.
//
// Takes the blocks from markdown.js and produces one or more EmbedBuilders with
// real visual hierarchy: a leading H1 becomes the embed title, headings render
// as native Discord markdown headers, lists/quotes/code keep their structure,
// and "Warning/Note/Tip" paragraphs become highlighted blockquote callouts.
// Long content is split across multiple embeds while respecting Discord's limits
// (4096 / embed description, 6000 total / message, 10 embeds / message).
'use strict';

const { EmbedBuilder } = require('discord.js');
const { COLORS, DIVIDER, brandFooter } = require('../../ui/theme');

const MAX_TITLE = 256;
const MAX_DESC = 4096;
const SOFT_DESC = 3800;   // start a new embed before hitting the hard cap
const TOTAL_BUDGET = 5800; // headroom under the 6000/message limit
const MAX_EMBEDS = 10;

const CALLOUT_STYLE = {
  warning:   { icon: '⚠️', label: 'Warning' },
  important: { icon: 'ℹ️', label: 'Important' },
  tip:       { icon: '💡', label: 'Tip' },
};

// Render a single block to its Markdown string representation.
function renderBlock(b) {
  switch (b.type) {
    case 'heading':
      return `${'#'.repeat(Math.min(b.level, 3))} ${b.text}`;
    case 'paragraph':
      return b.text;
    case 'list':
      return b.items
        .map((it, idx) => (b.ordered ? `${idx + 1}. ${it}` : `- ${it}`))
        .join('\n');
    case 'quote':
      return b.text.split('\n').map((l) => `> ${l}`).join('\n');
    case 'code':
      return '```' + (b.lang || '') + '\n' + b.text + '\n```';
    case 'divider':
      return DIVIDER;
    case 'callout': {
      const s = CALLOUT_STYLE[b.variant] || CALLOUT_STYLE.important;
      const head = `> ${s.icon} **${s.label}**`;
      const body = b.text.split('\n').map((l) => `> ${l}`).join('\n');
      return `${head}\n${body}`;
    }
    default:
      return '';
  }
}

// Pack rendered block strings into description chunks under the per-embed cap.
function chunk(parts) {
  const out = [];
  let cur = '';
  for (let part of parts) {
    if (!part || !part.trim()) continue;
    // Hard-split a single oversized block.
    while (part.length > MAX_DESC) {
      if (cur) { out.push(cur); cur = ''; }
      out.push(part.slice(0, MAX_DESC));
      part = part.slice(MAX_DESC);
    }
    const sep = cur ? '\n\n' : '';
    if (cur && cur.length + sep.length + part.length > SOFT_DESC) {
      out.push(cur);
      cur = part;
    } else {
      cur += sep + part;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * buildEmbeds(blocks, opts) → EmbedBuilder[]
 * opts: { scope, title, color, author, thumbnail, image }
 *   scope    — any object with a .client (enables the branded footer + timestamp)
 *   title    — overrides the promoted H1
 *   color    — first embed accent (default brand)
 */
function buildEmbeds(blocks, opts = {}) {
  const { scope, color = COLORS.brand, author, thumbnail, image } = opts;
  let title = opts.title || null;
  let body = Array.isArray(blocks) ? blocks.slice() : [];

  // Promote a leading H1 to the title when no explicit title was given.
  if (!title && body[0] && body[0].type === 'heading' && body[0].level === 1) {
    title = body[0].text;
    body = body.slice(1);
  }
  if (title) title = title.slice(0, MAX_TITLE);

  const rendered = body.map(renderBlock);
  let chunks = chunk(rendered);

  // Enforce the per-message total budget + embed count.
  const finalChunks = [];
  let used = title ? title.length : 0;
  for (const c of chunks) {
    if (finalChunks.length >= MAX_EMBEDS) break;
    if (used + c.length > TOTAL_BUDGET) {
      const room = TOTAL_BUDGET - used - 1;
      if (room > 80) { finalChunks.push(c.slice(0, room).trimEnd() + '…'); }
      break;
    }
    finalChunks.push(c);
    used += c.length;
  }

  // Nothing renderable and no title → let the caller fall back to raw content.
  if (finalChunks.length === 0 && !title) return [];
  if (finalChunks.length === 0) finalChunks.push(''); // title-only embed

  const embeds = finalChunks.map((desc, idx) => {
    const e = new EmbedBuilder().setColor(idx === 0 ? color : COLORS.neutral);
    if (idx === 0 && title) e.setTitle(title);
    if (desc) e.setDescription(desc);
    if (idx === 0 && author) e.setAuthor(author);
    if (idx === 0 && thumbnail) e.setThumbnail(thumbnail);
    if (idx === finalChunks.length - 1 && image) e.setImage(image);
    return e;
  });

  // Footer + timestamp live on the last embed only, so a multi-embed post reads
  // as a single branded unit instead of repeating the footer on every card.
  if (scope) embeds[embeds.length - 1].setFooter(brandFooter(scope)).setTimestamp();

  return embeds;
}

module.exports = { buildEmbeds, renderBlock };
