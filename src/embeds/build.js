// src/embeds/build.js — shared embed construction + validation + perm preflight.
const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { BRAND } = require('../ui/theme');
const { normalizeText } = require('../core/format');

function parseColor(input) {
  if (!input) return BRAND;
  const m = /^#?([0-9a-fA-F]{6})$/.exec(String(input).trim());
  return m ? parseInt(m[1], 16) : null; // null = invalid
}
function isUrl(s) { return /^https?:\/\/\S+$/i.test(s || ''); }

// Returns { embed } or { error }.
function buildEmbed(opts) {
  const embed = new EmbedBuilder();
  let has = false;
  if (opts.title) { embed.setTitle(String(opts.title).slice(0, 256)); has = true; }
  if (opts.description) {
    // Clean up pasted content (smart quotes, bullets, HTML, blank-line walls)
    // before it lands in the embed so it reads as professional formatting.
    const desc = normalizeText(String(opts.description).replace(/\\n/g, '\n')).slice(0, 4096);
    if (desc) { embed.setDescription(desc); has = true; }
  }
  if (opts.author_name) embed.setAuthor({ name: String(opts.author_name).slice(0, 256) });
  if (opts.footer) embed.setFooter({ text: String(opts.footer).slice(0, 2048) });
  if (opts.image) { if (!isUrl(opts.image)) return { error: 'Image must be a valid http(s) URL.' }; embed.setImage(opts.image); }
  if (opts.thumbnail) { if (!isUrl(opts.thumbnail)) return { error: 'Thumbnail must be a valid http(s) URL.' }; embed.setThumbnail(opts.thumbnail); }
  const color = parseColor(opts.color);
  if (color === null) return { error: 'Color must be a hex code like #5865F2.' };
  embed.setColor(color);
  if (!has) return { error: 'Provide at least a title or a description.' };
  embed.setTimestamp();
  return { embed };
}

// Returns array of missing permission names for the bot in `channel`.
function checkSendPerms(channel, me, needMention) {
  const perms = channel.permissionsFor(me);
  const missing = [];
  if (!perms || !perms.has(PermissionFlagsBits.ViewChannel)) missing.push('View Channel');
  if (!perms || !perms.has(PermissionFlagsBits.SendMessages)) missing.push('Send Messages');
  if (!perms || !perms.has(PermissionFlagsBits.EmbedLinks)) missing.push('Embed Links');
  if (needMention && (!perms || !perms.has(PermissionFlagsBits.MentionEveryone))) missing.push('Mention Everyone');
  return missing;
}
module.exports = { buildEmbed, parseColor, checkSendPerms, isUrl, BRAND };
