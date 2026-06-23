// src/core/format/normalize.js — turn arbitrary pasted content into clean Markdown.
//
// People paste from ChatGPT, Notion, Google Docs, Word, .md files and raw HTML.
// Each source brings its own garbage: smart quotes, non-breaking spaces, exotic
// bullet glyphs, HTML tags, tab indentation, and walls of blank lines. This
// module strips all of that down to normalized GitHub-flavored Markdown so the
// parser + embed builder downstream get a predictable input.
//
// The Unicode cleanup regexes are built from char codes (String.fromCharCode) so
// the source file stays pure ASCII — no invisible/ambiguous glyphs to maintain.
'use strict';

const cc = (...codes) => String.fromCharCode(...codes);

// Unicode cleanup classes (built from code points).
const RE_NBSP        = new RegExp(cc(0x00a0), 'g');
const RE_ZERO_WIDTH  = new RegExp('[' + cc(0x200b, 0x200c, 0x200d, 0xfeff) + ']', 'g');
const RE_SQUOTES     = new RegExp('[' + cc(0x2018, 0x2019, 0x201a, 0x201b) + ']', 'g');
const RE_DQUOTES     = new RegExp('[' + cc(0x201c, 0x201d, 0x201e, 0x201f) + ']', 'g');
// Exotic bullet glyphs at the start of a line: • ▪ ◦ ‣ · ∙ ● ○ and "*".
const RE_BULLET      = new RegExp('^[ \\t]*[' + cc(0x2022, 0x25aa, 0x25e6, 0x2023, 0x00b7, 0x2219, 0x25cf, 0x25cb) + '*][ \\t]+', 'gm');
// En/em-dash used as a bullet: – —
const RE_DASH_BULLET = new RegExp('^[ \\t]*[' + cc(0x2013, 0x2014) + '][ \\t]+', 'gm');

// ── HTML handling ────────────────────────────────────────────────────────────
function looksLikeHtml(s) {
  return /<\/?(p|div|span|h[1-6]|ul|ol|li|a|strong|b|em|i|br|blockquote|pre|code|hr|table)\b[^>]*>/i.test(s);
}

function decodeEntities(s) {
  return String(s)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&(apos|#39);/gi, "'")
    .replace(/&hellip;/gi, cc(0x2026))
    .replace(/&mdash;/gi, cc(0x2014))
    .replace(/&ndash;/gi, cc(0x2013))
    .replace(/&bull;/gi, cc(0x2022))
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(Number(n)); } catch { return ''; } })
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => { try { return String.fromCodePoint(parseInt(n, 16)); } catch { return ''; } });
}

// Convert the common subset of HTML that paste sources emit into Markdown.
function htmlToMarkdown(html) {
  let s = String(html);
  s = s.replace(/<!--[\s\S]*?-->/g, '');                       // comments
  s = s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '');         // script/style
  s = s.replace(/<head[\s\S]*?<\/head>/gi, '');                 // doc head

  // Ordered lists FIRST so we can keep the numbering, then generic <li>.
  s = s.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_, inner) => {
    let i = 0;
    const body = inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (__, t) => `\n${++i}. ${t.trim()}`);
    return `\n${body}\n`;
  });
  s = s.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, t) => `\n- ${t.trim()}`);
  s = s.replace(/<\/?(ul|ol)[^>]*>/gi, '\n');

  // Headings (cap at h3 — Discord only renders #, ##, ###).
  for (let lvl = 1; lvl <= 6; lvl++) {
    const hashes = '#'.repeat(Math.min(lvl, 3));
    s = s.replace(new RegExp(`<h${lvl}[^>]*>([\\s\\S]*?)<\\/h${lvl}>`, 'gi'),
      (_, t) => `\n${hashes} ${t.replace(/\s+/g, ' ').trim()}\n`);
  }

  // Inline emphasis + code.
  s = s.replace(/<\s*(strong|b)\b[^>]*>([\s\S]*?)<\/\s*\1\s*>/gi, (_, __, t) => `**${t.trim()}**`);
  s = s.replace(/<\s*(em|i)\b[^>]*>([\s\S]*?)<\/\s*\1\s*>/gi, (_, __, t) => `*${t.trim()}*`);
  s = s.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, t) => `\n\`\`\`\n${t.replace(/<[^>]+>/g, '').trim()}\n\`\`\`\n`);
  s = s.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_, t) => `\`${t.trim()}\``);

  // Block quotes.
  s = s.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, t) =>
    '\n' + t.replace(/<[^>]+>/g, '').trim().split(/\n+/).map((l) => `> ${l.trim()}`).join('\n') + '\n');

  // Links + images.
  s = s.replace(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, t) => {
    const label = t.replace(/<[^>]+>/g, '').trim();
    return label ? `[${label}](${href})` : href;
  });
  s = s.replace(/<img[^>]*alt=["']([^"']*)["'][^>]*>/gi, (_, alt) => (alt ? `(${alt})` : ''));

  // Structure.
  s = s.replace(/<hr\s*\/?>/gi, '\n---\n');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/(p|div|section|article|tr|h[1-6])>/gi, '\n\n');
  s = s.replace(/<[^>]+>/g, ''); // strip anything left

  return decodeEntities(s);
}

// ── Main normalizer ──────────────────────────────────────────────────────────
/**
 * normalizeText(input) → string
 * Returns clean, predictable Markdown. Always safe on any input.
 */
function normalizeText(input) {
  let s = String(input ?? '');
  if (!s.trim()) return '';

  if (looksLikeHtml(s)) s = htmlToMarkdown(s);

  s = s
    .replace(/\r\n?/g, '\n')   // CRLF / CR → LF
    .replace(RE_NBSP, ' ')     // non-breaking space
    .replace(RE_ZERO_WIDTH, '')// zero-width junk
    .replace(/\t/g, '  ')      // tabs → 2 spaces
    .replace(RE_SQUOTES, "'")  // smart single quotes
    .replace(RE_DQUOTES, '"'); // smart double quotes

  // Normalize exotic bullet glyphs at the start of a line into "- ".
  s = s.replace(RE_BULLET, '- ').replace(RE_DASH_BULLET, '- ');
  // "1)" / "1 )" numbered markers → "1."
  s = s.replace(/^([ \t]*)(\d+)[ \t]*\)[ \t]+/gm, '$1$2. ');

  s = s
    .replace(/[ \t]+$/gm, '')   // trailing spaces
    .replace(/\n{3,}/g, '\n\n') // collapse runs of blank lines to one
    .replace(/^\n+/, '')        // leading blank lines
    .replace(/\n+$/, '');       // trailing blank lines

  return s;
}

module.exports = { normalizeText, htmlToMarkdown, looksLikeHtml, decodeEntities };
