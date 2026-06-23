// src/core/format/markdown.js — parse normalized Markdown into a block model.
//
// Input is the clean Markdown produced by normalize.js. Output is a flat array
// of typed blocks that autoEmbed.js renders into Discord embeds. Keeping the
// parse separate from the render keeps both pure and unit-testable.
//
// Block shapes:
//   { type: 'heading',   level: 1|2|3, text }
//   { type: 'paragraph', text }
//   { type: 'list',      ordered: boolean, items: string[] }
//   { type: 'quote',     text }
//   { type: 'code',      lang, text }
//   { type: 'divider' }
//   { type: 'callout',   variant: 'warning'|'important'|'tip', text }
'use strict';

// Paragraphs whose first line matches one of these become highlighted callouts.
const CALLOUTS = [
  { variant: 'warning',   re: /^(?:⚠️?\s*)?(warning|caution|danger)\b\s*[:\-—]\s*/i },
  { variant: 'important', re: /^(?:❗\s*)?(important|attention|note|notice)\b\s*[:\-—]\s*/i },
  { variant: 'tip',       re: /^(?:💡\s*)?(tip|hint|pro\s?tip)\b\s*[:\-—]\s*/i },
];

const RE_HEADING  = /^(#{1,3})\s+(.*)$/;
const RE_DIVIDER  = /^\s*(?:-{3,}|_{3,}|\*{3,}|={3,})\s*$/;
const RE_QUOTE    = /^\s*>\s?/;
const RE_LIST     = /^\s*(?:-|\*|\d+\.)\s+/;
const RE_ORDERED  = /^\s*\d+\.\s+/;
const RE_FENCE    = /^\s*```/;

function detectCallout(text) {
  for (const c of CALLOUTS) {
    if (c.re.test(text)) return { variant: c.variant, text: text.replace(c.re, '').trim() };
  }
  return null;
}

function isBlockStart(line) {
  return (
    RE_FENCE.test(line) ||
    RE_HEADING.test(line.trim()) ||
    RE_DIVIDER.test(line) ||
    RE_QUOTE.test(line) ||
    RE_LIST.test(line)
  );
}

/**
 * parseBlocks(md) → block[]
 */
function parseBlocks(md) {
  const lines = String(md ?? '').split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '') { i++; continue; }

    // Fenced code block.
    if (RE_FENCE.test(line)) {
      const lang = line.trim().replace(/^```/, '').trim();
      const buf = [];
      i++;
      while (i < lines.length && !RE_FENCE.test(lines[i])) { buf.push(lines[i]); i++; }
      i++; // consume closing fence
      blocks.push({ type: 'code', lang, text: buf.join('\n') });
      continue;
    }

    // Divider.
    if (RE_DIVIDER.test(line)) { blocks.push({ type: 'divider' }); i++; continue; }

    // Heading.
    const h = RE_HEADING.exec(line.trim());
    if (h) { blocks.push({ type: 'heading', level: h[1].length, text: h[2].trim() }); i++; continue; }

    // Block quote (consume consecutive quoted lines).
    if (RE_QUOTE.test(line)) {
      const buf = [];
      while (i < lines.length && RE_QUOTE.test(lines[i])) { buf.push(lines[i].replace(RE_QUOTE, '')); i++; }
      blocks.push({ type: 'quote', text: buf.join('\n').trim() });
      continue;
    }

    // List (consume consecutive list items).
    if (RE_LIST.test(line)) {
      const ordered = RE_ORDERED.test(line);
      const items = [];
      while (i < lines.length && RE_LIST.test(lines[i])) {
        items.push(lines[i].replace(RE_LIST, '').trim());
        i++;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    // Paragraph (accumulate until a blank line or the next block starter).
    const buf = [];
    while (i < lines.length && lines[i].trim() !== '' && !isBlockStart(lines[i])) {
      buf.push(lines[i]);
      i++;
    }
    const text = buf.join('\n').trim();
    const callout = detectCallout(text);
    if (callout) blocks.push({ type: 'callout', variant: callout.variant, text: callout.text });
    else blocks.push({ type: 'paragraph', text });
  }

  return blocks;
}

module.exports = { parseBlocks, detectCallout };
