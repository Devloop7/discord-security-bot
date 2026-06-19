// src/core/cases.js — persistent moderation cases (warnings + private mod notes).
const store = require('./store');
const FILE = 'cases.json';

function db() {
  return store.read(FILE, { seq: 0, cases: {} });
}

// type: 'warn' | 'note'
function add(userId, { type, modId, reason }) {
  const data = db();
  data.seq += 1;
  const entry = { id: data.seq, type, modId, reason: reason || 'No reason given', ts: Date.now() };
  (data.cases[userId] = data.cases[userId] || []).push(entry);
  store.write(FILE, data);
  return entry;
}

function list(userId) {
  return db().cases[userId] || [];
}

function warnings(userId) {
  return list(userId).filter((c) => c.type === 'warn');
}

function clear(userId) {
  const data = db();
  const n = (data.cases[userId] || []).length;
  delete data.cases[userId];
  store.write(FILE, data);
  return n;
}

function remove(caseId) {
  const data = db();
  let removed = false;
  for (const uid of Object.keys(data.cases)) {
    const before = data.cases[uid].length;
    data.cases[uid] = data.cases[uid].filter((c) => c.id !== caseId);
    if (data.cases[uid].length !== before) removed = true;
    if (data.cases[uid].length === 0) delete data.cases[uid];
  }
  if (removed) store.write(FILE, data);
  return removed;
}

module.exports = { add, list, warnings, clear, remove };
