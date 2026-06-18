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
