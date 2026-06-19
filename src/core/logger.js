// src/core/logger.js — leveled logger controlled by LOG_LEVEL / NODE_ENV, with optional file logging.
const fs = require('node:fs');
const path = require('node:path');

const LEVELS = { silent: -1, error: 0, warn: 1, info: 2, debug: 3 };

// In production, default to a quieter console unless LOG_LEVEL is explicitly set.
const defaultLevel = process.env.NODE_ENV === 'production' ? 'warn' : 'info';
const current = LEVELS[(process.env.LOG_LEVEL || defaultLevel).toLowerCase()] ?? LEVELS.info;

// Optional file logging (LOG_TO_FILE=true → appends to logs/bot.log).
const fileEnabled = ['1', 'true', 'yes', 'on'].includes(String(process.env.LOG_TO_FILE || '').toLowerCase());
const logDir = process.env.BOT_LOG_DIR || path.join(__dirname, '..', '..', 'logs');
const logFile = path.join(logDir, 'bot.log');

function fmt(a) {
  if (a instanceof Error) return a.stack || a.message;
  if (a && typeof a === 'object') {
    try { return JSON.stringify(a); } catch { return String(a); }
  }
  return String(a);
}

function toFile(level, args) {
  try {
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] [${level.toUpperCase()}] ${args.map(fmt).join(' ')}\n`);
  } catch {
    /* never let logging crash the bot */
  }
}

function at(level, method, args) {
  if (current < LEVELS[level]) return;
  console[method](...args);
  if (fileEnabled) toFile(level, args);
}

module.exports = {
  error: (...a) => at('error', 'error', a),
  warn: (...a) => at('warn', 'warn', a),
  info: (...a) => at('info', 'log', a),
  debug: (...a) => at('debug', 'log', a),
};
