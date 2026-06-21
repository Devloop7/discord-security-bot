// test/embedBuild.test.js — pure logic tests for src/embeds/build.js
const { test } = require('node:test');
const assert = require('node:assert');
const { parseColor, buildEmbed, BRAND } = require('../src/embeds/build');

// ── parseColor ────────────────────────────────────────────────────────────────
test('parseColor: #5865F2 returns 0x5865F2', () => {
  assert.strictEqual(parseColor('#5865F2'), 0x5865F2);
});

test('parseColor: 5865F2 (no hash) returns 0x5865F2', () => {
  assert.strictEqual(parseColor('5865F2'), 0x5865F2);
});

test('parseColor: invalid string returns null', () => {
  assert.strictEqual(parseColor('nope'), null);
});

test('parseColor: undefined returns BRAND default', () => {
  assert.strictEqual(parseColor(), BRAND);
});

test('parseColor: null returns BRAND default', () => {
  assert.strictEqual(parseColor(null), BRAND);
});

// ── buildEmbed errors ─────────────────────────────────────────────────────────
test('buildEmbed: no title or description → error', () => {
  const result = buildEmbed({});
  assert.ok(result.error, 'expected an error message');
  assert.ok(!result.embed, 'expected no embed');
});

test('buildEmbed: invalid image URL → error', () => {
  const result = buildEmbed({ title: 'x', image: 'notaurl' });
  assert.ok(result.error, 'expected an error for bad image URL');
});

test('buildEmbed: invalid color → error', () => {
  const result = buildEmbed({ title: 'x', color: 'ZZZZZZ' });
  assert.ok(result.error, 'expected an error for bad color');
});

// ── buildEmbed success ────────────────────────────────────────────────────────
test('buildEmbed: valid title + description returns embed', () => {
  const result = buildEmbed({ title: 'Hi', description: 'a\\nb' });
  assert.ok(!result.error, `unexpected error: ${result.error}`);
  assert.ok(result.embed, 'expected an embed');
  assert.strictEqual(result.embed.data.title, 'Hi');
  // \\n in the raw string should have been converted to a real newline
  assert.ok(result.embed.data.description.includes('\n'), 'description should contain a real newline');
});

test('buildEmbed: description only is valid', () => {
  const result = buildEmbed({ description: 'Hello world' });
  assert.ok(!result.error);
  assert.ok(result.embed);
});

test('buildEmbed: valid hex color is applied', () => {
  const result = buildEmbed({ title: 'Colored', color: '#FF0000' });
  assert.ok(!result.error);
  assert.strictEqual(result.embed.data.color, 0xFF0000);
});

test('buildEmbed: valid image URL does not error', () => {
  const result = buildEmbed({ title: 'Img', image: 'https://example.com/img.png' });
  assert.ok(!result.error, `unexpected error: ${result.error}`);
});
