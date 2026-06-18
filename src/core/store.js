// src/core/store.js
const fs = require('node:fs');
const path = require('node:path');

function dataDir() {
  return process.env.BOT_DATA_DIR || path.join(__dirname, '..', '..', 'data');
}

function ensureDir() {
  const dir = dataDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function read(name, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(path.join(ensureDir(), name), 'utf8'));
  } catch {
    return fallback;
  }
}

function write(name, data) {
  const file = path.join(ensureDir(), name);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file); // near-atomic replace
}

module.exports = { read, write, dataDir };
