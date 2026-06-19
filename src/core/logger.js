// src/core/logger.js — minimal leveled logger controlled by the LOG_LEVEL env var.
const LEVELS = { silent: -1, error: 0, warn: 1, info: 2, debug: 3 };
const current = LEVELS[(process.env.LOG_LEVEL || 'info').toLowerCase()] ?? LEVELS.info;

function at(level, method, args) {
  if (current >= LEVELS[level]) console[method](...args);
}

module.exports = {
  error: (...a) => at('error', 'error', a),
  warn: (...a) => at('warn', 'warn', a),
  info: (...a) => at('info', 'log', a),
  debug: (...a) => at('debug', 'log', a),
};
