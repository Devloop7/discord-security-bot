// src/autopost/index.js — durable scheduled/recurring auto-posts.
// Exports register(client) which wires the 'autopost' scheduler handler.
// Data store: autoposts.json, keyed by id. Each value:
//   { id, guildId, channelId, title|null, message, every, nextAt, jobId }
'use strict';

const { EmbedBuilder } = require('discord.js');
const store = require('../core/store');
const scheduler = require('../core/scheduler');
const logger = require('../core/logger');
const { nextRunAt } = require('./schedule');
const { buildEmbed } = require('../embeds/build');

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

// ── new-style post rendering ─────────────────────────────────────────────────
// Render + send a NEW-style def's message (payload-based) into `channel`.
// Returns the sent message. Mentions are suppressed unless an explicit
// mentionRoleId is set, which is then whitelisted via allowedMentions.
async function sendPost(channel, def) {
  const p = def.payload || {};
  let payload;
  if (p.embed) payload = { embeds: [p.embed] };
  else if (p.kind === 'embed' || p.title) {
    const { embed } = buildEmbed({ title: p.title, description: p.content });
    payload = embed ? { embeds: [embed] } : { content: String(p.content || '').slice(0, 2000) };
  } else {
    payload = { content: String(p.content || '').slice(0, 2000) };
  }
  const allowed = { parse: [] };
  if (p.mentionRoleId) {
    payload.content = ('<@&' + p.mentionRoleId + '> ' + (payload.content || '')).trim();
    allowed.roles = [p.mentionRoleId];
  }
  payload.allowedMentions = allowed;
  const sent = await channel.send(payload);
  if (p.pin) await sent.pin().catch(() => {});
  return sent;
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
        // Channel temporarily/permanently gone: re-arm recurring posts so a transient
        // fetch blip can't delete them; only drop a completed/expired one-off.
        if (def.schedule) {
          if (def.schedule.type === 'once') { await deleteDef(def.id); return; }
          const next = nextRunAt(def.schedule, Date.now());
          if (next) {
            const jobId = scheduler.schedule('autopost', next, { id: def.id });
            await patchDef(def.id, { nextAt: next, jobId });
          } else {
            await deleteDef(def.id);
          }
          return;
        }
        if (def.every === 'once') await deleteDef(def.id);
        else await rescheduleNext(def);
        return;
      }

      // NEW-style def: payload + structured schedule. Render, send, then
      // re-arm (or remove on a completed 'once'). Legacy path is below.
      if (def.schedule) {
        if (def.enabled === false) return; // paused (shouldn't have a job, guard anyway)
        await sendPost(channel, def);
        if (def.schedule.type === 'once') { await deleteDef(def.id); return; }
        const next = nextRunAt(def.schedule, Date.now());
        if (!next) { await deleteDef(def.id); return; }
        const jobId = scheduler.schedule('autopost', next, { id: def.id });
        await patchDef(def.id, { nextAt: next, jobId });
        return;
      }

      // LEGACY-style def: title/message + every-based recurrence.
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
  sendPost,
  FILE,
};
