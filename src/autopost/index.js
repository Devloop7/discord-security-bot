// src/autopost/index.js — durable scheduled/recurring auto-posts.
// Exports register(client) which wires the 'autopost' scheduler handler.
// Data store: autoposts.json, keyed by id. Each value:
//   { id, guildId, channelId, title|null, message, every, nextAt, jobId }
'use strict';

const { EmbedBuilder } = require('discord.js');
const store = require('../core/store');
const scheduler = require('../core/scheduler');
const logger = require('../core/logger');

const FILE = 'autoposts.json';

// Interval in ms for each recurrence type ('once' = no repeat).
const INTERVALS = {
  hourly: 3600000,
  daily: 86400000,
  weekly: 604800000,
};

// parseDelay('10m'|'1h'|'2d'|'0') -> milliseconds. Falls back to 0 on bad input.
function parseDelay(str) {
  if (!str || str === '0') return 0;
  const m = /^(\d+)\s*([mhd])$/i.exec(String(str).trim());
  if (!m) return 0;
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  if (unit === 'm') return n * 60000;
  if (unit === 'h') return n * 3600000;
  if (unit === 'd') return n * 86400000;
  return 0;
}

// ── store helpers ──────────────────────────────────────────────────────────
function getAll() {
  return store.read(FILE, {});
}
function getDef(id) {
  return getAll()[id] || null;
}
function listForGuild(guildId) {
  const all = getAll();
  return Object.values(all).filter((d) => d.guildId === guildId);
}
function saveDef(def) {
  return store.mutate(FILE, (data) => { data[def.id] = def; }, {});
}
function deleteDef(id) {
  return store.mutate(FILE, (data) => { delete data[id]; }, {});
}
// Patch a stored def in place (hot write through mutate).
function patchDef(id, patch) {
  return store.mutate(FILE, (data) => {
    if (data[id]) Object.assign(data[id], patch);
  }, {});
}

// ── register the scheduler handler ───────────────────────────────────────────
function register(client) {
  scheduler.register('autopost', async (data, c) => {
    try {
      const def = getDef(data.id);
      if (!def) return; // removed before it fired

      const channel =
        c.channels.cache.get(def.channelId) ||
        (await c.channels.fetch(def.channelId).catch(() => null));
      if (!channel || typeof channel.send !== 'function') {
        logger.warn(`[autopost] channel ${def.channelId} not found for ${def.id}`);
        // Channel gone for a 'once' post — clean it up; recurring will retry next cycle.
        if (def.every === 'once') await deleteDef(def.id);
        else await rescheduleNext(def);
        return;
      }

      const payload = def.title
        ? { embeds: [new EmbedBuilder().setTitle(String(def.title).slice(0, 256)).setDescription(String(def.message).slice(0, 4096)).setColor(0x5865F2).setTimestamp()] }
        : { content: String(def.message).slice(0, 2000) };

      await channel.send({ ...payload, allowedMentions: { parse: [] } });

      if (def.every === 'once') {
        await deleteDef(def.id);
      } else {
        await rescheduleNext(def);
      }
    } catch (e) {
      logger.error('[autopost:run]', e.message);
    }
  });
}

// Compute next fire time for a recurring def, schedule it, and persist the new jobId/nextAt.
async function rescheduleNext(def) {
  const interval = INTERVALS[def.every];
  if (!interval) { await deleteDef(def.id); return; }
  // Advance to the next FUTURE slot in one jump so downtime doesn't cause a
  // catch-up burst of back-to-back posts after the bot restarts.
  let nextAt = def.nextAt + interval;
  const now = Date.now();
  if (nextAt <= now) nextAt += Math.ceil((now - nextAt) / interval) * interval;
  const jobId = scheduler.schedule('autopost', nextAt, { id: def.id });
  await patchDef(def.id, { nextAt, jobId });
}

module.exports = {
  register,
  parseDelay,
  INTERVALS,
  getDef,
  listForGuild,
  saveDef,
  deleteDef,
  patchDef,
  FILE,
};
