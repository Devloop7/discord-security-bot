// src/core/strikes.js
const store = require('./store');
const FILE = 'strikes.json';

function all() { return store.read(FILE, {}); }

function add(userId, type, decayMs = 0) {
  const data = all();
  const u = data[userId] || { link: 0, profanity: 0, linkTs: 0, profanityTs: 0 };
  const tsKey = type + 'Ts';
  if (decayMs > 0 && u[tsKey] && Date.now() - u[tsKey] > decayMs) {
    u[type] = 0; // decayed — reset this type's count before incrementing
  }
  u[type] = (u[type] || 0) + 1;
  u[tsKey] = Date.now();
  data[userId] = u;
  store.write(FILE, data);
  return u[type];
}

function get(userId, decayMs = 0) {
  const u = all()[userId] || {};
  const now = Date.now();
  const link = (decayMs > 0 && u.linkTs && now - u.linkTs > decayMs) ? 0 : (u.link || 0);
  const profanity = (decayMs > 0 && u.profanityTs && now - u.profanityTs > decayMs) ? 0 : (u.profanity || 0);
  return { link, profanity };
}

function reset(userId) {
  const data = all();
  delete data[userId];
  store.write(FILE, data);
}

module.exports = { add, get, reset };
