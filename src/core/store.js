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

const queues = new Map(); // file name -> Promise chain
function mutate(name, fn, fallback = {}) {
  const prev = queues.get(name) || Promise.resolve();
  const next = prev.then(async () => {
    const data = read(name, fallback);
    const result = await fn(data); // fn mutates `data` in place; may return a value
    write(name, data);
    return result;
  });
  queues.set(name, next.catch(() => {})); // keep the chain alive even if one op throws
  return next;
}

module.exports = { read, write, dataDir, mutate };
