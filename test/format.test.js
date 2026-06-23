// test/format.test.js — Smart Post Formatter (normalize → parse → embeds).
const { test } = require('node:test');
const assert = require('node:assert');

const { normalizeText, htmlToMarkdown } = require('../src/core/format/normalize');
const { parseBlocks } = require('../src/core/format/markdown');
const { formatToEmbeds } = require('../src/core/format');

const cc = (...c) => String.fromCharCode(...c);

// ── normalize ────────────────────────────────────────────────────────────────
test('normalize collapses 3+ blank lines to one and trims edges', () => {
  const out = normalizeText('\n\nHello\n\n\n\nWorld\n\n');
  assert.strictEqual(out, 'Hello\n\nWorld');
});

test('normalize converts smart quotes to straight quotes', () => {
  const input = cc(0x201c) + 'quoted' + cc(0x201d) + ' and ' + cc(0x2019) + 's';
  assert.strictEqual(normalizeText(input), '"quoted" and \'s');
});

test('normalize strips nbsp and zero-width chars', () => {
  const input = 'a' + cc(0x00a0) + 'b' + cc(0x200b) + 'c';
  assert.strictEqual(normalizeText(input), 'a b' + 'c'.replace('c', 'c')); // a b c with collapsed
  assert.strictEqual(normalizeText(input).replace(/\s+/g, ' '), 'a bc');
});

test('normalize rewrites exotic bullets and "1)" markers', () => {
  const input = cc(0x2022) + ' first\n' + cc(0x25aa) + ' second\n1) third';
  assert.strictEqual(normalizeText(input), '- first\n- second\n1. third');
});

test('normalize converts HTML to markdown', () => {
  const html = '<h1>Title</h1><p>Hello <b>bold</b> and <i>italic</i></p><ul><li>a</li><li>b</li></ul>';
  const md = htmlToMarkdown(html);
  assert.match(md, /# Title/);
  assert.match(md, /\*\*bold\*\*/);
  assert.match(md, /\*italic\*/);
  assert.match(md, /- a/);
  assert.match(md, /- b/);
});

test('normalize keeps ordered list numbering from HTML', () => {
  const md = normalizeText('<ol><li>one</li><li>two</li></ol>');
  assert.match(md, /1\. one/);
  assert.match(md, /2\. two/);
});

// ── parseBlocks ──────────────────────────────────────────────────────────────
test('parseBlocks identifies headings, lists, quotes, code, dividers', () => {
  const md = [
    '# Big',
    '## Small',
    'A paragraph.',
    '- one',
    '- two',
    '> a quote',
    '```js',
    'const x = 1;',
    '```',
    '---',
  ].join('\n');
  const blocks = parseBlocks(md);
  const types = blocks.map((b) => b.type);
  assert.deepStrictEqual(types, ['heading', 'heading', 'paragraph', 'list', 'quote', 'code', 'divider']);
  assert.strictEqual(blocks[0].level, 1);
  assert.strictEqual(blocks[3].items.length, 2);
  assert.strictEqual(blocks[5].lang, 'js');
});

test('parseBlocks detects warning/tip callouts', () => {
  const blocks = parseBlocks('Warning: do not do this\n\nTip: try this instead');
  assert.strictEqual(blocks[0].type, 'callout');
  assert.strictEqual(blocks[0].variant, 'warning');
  assert.strictEqual(blocks[1].variant, 'tip');
});

// ── formatToEmbeds ───────────────────────────────────────────────────────────
test('formatToEmbeds promotes a leading H1 to the embed title', () => {
  const [embed] = formatToEmbeds('# Server Rules\n\nBe nice.');
  const json = embed.toJSON();
  assert.strictEqual(json.title, 'Server Rules');
  assert.match(json.description, /Be nice\./);
});

test('formatToEmbeds renders a callout as a blockquote with an icon', () => {
  const [embed] = formatToEmbeds('Warning: hot surface');
  const json = embed.toJSON();
  assert.match(json.description, /> .*\*\*Warning\*\*/);
  assert.match(json.description, /> hot surface/);
});

test('formatToEmbeds splits very long content into multiple embeds', () => {
  const para = 'x'.repeat(2000);
  const raw = [para, para, para].join('\n\n'); // ~6000 chars across 3 blocks
  const embeds = formatToEmbeds(raw);
  assert.ok(embeds.length >= 2, `expected multiple embeds, got ${embeds.length}`);
  for (const e of embeds) {
    assert.ok((e.toJSON().description || '').length <= 4096);
  }
});

test('formatToEmbeds returns [] for empty input (caller falls back)', () => {
  assert.deepStrictEqual(formatToEmbeds('   '), []);
});

test('formatToEmbeds respects an explicit title over content', () => {
  const [embed] = formatToEmbeds('Just a body line', { title: 'Custom' });
  assert.strictEqual(embed.toJSON().title, 'Custom');
});
