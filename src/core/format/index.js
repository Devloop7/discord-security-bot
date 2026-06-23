// src/core/format/index.js — public API for the Smart Post Formatter.
//
// One entry point the rest of the bot uses to turn raw, pasted content into
// clean, professionally formatted Discord output:
//
//   formatToEmbeds(raw, opts) → EmbedBuilder[]   (auto visual hierarchy)
//   formatToText(raw)         → string           (normalized Markdown, for plain sends)
//
// Pipeline:  normalize (clean) → parseBlocks (structure) → buildEmbeds (render).
'use strict';

const { normalizeText } = require('./normalize');
const { parseBlocks } = require('./markdown');
const { buildEmbeds } = require('./autoEmbed');

/**
 * formatToEmbeds(raw, opts) → EmbedBuilder[]
 * Returns [] when there is nothing renderable (caller may fall back to text).
 * opts: { scope, title, color, author, thumbnail, image }
 */
function formatToEmbeds(raw, opts = {}) {
  const md = normalizeText(raw);
  if (!md) return [];
  const blocks = parseBlocks(md);
  return buildEmbeds(blocks, opts);
}

/**
 * formatToText(raw) → string
 * Normalized Markdown only (no embed). Use for plain-content sends so even
 * non-embed messages get clean spacing and tidy lists.
 */
function formatToText(raw) {
  return normalizeText(raw);
}

module.exports = {
  formatToEmbeds,
  formatToText,
  normalizeText,
  parseBlocks,
};
