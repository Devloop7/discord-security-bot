const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'botlog-'));
process.env.BOT_LOG_DIR = dir;
process.env.LOG_TO_FILE = 'true';
process.env.LOG_LEVEL = 'debug';
const logger = require('../src/core/logger');

test('file logging writes lines when LOG_TO_FILE is enabled', () => {
  logger.info('hello', 'world');
  logger.error('boom');
  const content = fs.readFileSync(path.join(dir, 'bot.log'), 'utf8');
  assert.match(content, /\[INFO\] hello world/);
  assert.match(content, /\[ERROR\] boom/);
});
