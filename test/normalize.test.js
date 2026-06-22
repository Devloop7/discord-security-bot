// test/normalize.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { normalize, containsBadWord } = require('../src/protection/normalize');

test('normalize collapses leetspeak, spacing, and repeats', () => {
  assert.strictEqual(normalize('F.U.C.K'), 'fuck');
  assert.strictEqual(normalize('sh1t'), 'shit');
  assert.strictEqual(normalize('fuuuuck'), 'fuck');
  assert.strictEqual(normalize('@ss'), 'as'); // repeats collapsed
});

test('containsBadWord catches obfuscated profanity', () => {
  const words = ['fuck', 'shit'];
  assert.strictEqual(containsBadWord('what the f u c k', words), true);
  assert.strictEqual(containsBadWord('sh!t happens', words), true);
  assert.strictEqual(containsBadWord('have a nice day', words), false);
});

test('containsBadWord does not false-positive on innocent substrings', () => {
  assert.strictEqual(containsBadWord('what a great class', ['ass']), false);
  assert.strictEqual(containsBadWord('the assassin struck', ['ass']), false);
  assert.strictEqual(containsBadWord('fuuuck this', ['fuck']), true);
});

test('containsBadWord whitelist suppresses a match', () => {
  assert.strictEqual(containsBadWord('damn', ['damn']), true);
  assert.strictEqual(containsBadWord('damn', ['damn'], ['damn']), false);
});
