// src/core/strikes.js
const store = require('./store');
const FILE = 'strikes.json';

function all() { return store.read(FILE, {}); }

function add(userId, type) {
  const data = all();
  const u = data[userId] || { link: 0, profanity: 0 };
  u[type] = (u[type] || 0) + 1;
  data[userId] = u;
  store.write(FILE, data);
  return u[type];
}

function get(userId) {
  return { link: 0, profanity: 0, ...all()[userId] };
}

function reset(userId) {
  const data = all();
  delete data[userId];
  store.write(FILE, data);
}

module.exports = { add, get, reset };
