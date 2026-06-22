// src/autopost/schedule.js — schedule validation + next-run computation for auto-posts v2.
//
// Calendar-aligned types (daily/weekly/monthly) are converted to a cron pattern and resolved with
// croner (timezone + DST aware). One-time and interval types use plain arithmetic — no cron needed.
// Everything here is pure (given a `fromMs`), so the next-run math is fully unit-testable.
//
// schedule shape:
//   { type:'once'|'daily'|'weekly'|'monthly'|'interval', tz,
//     at, time:'HH:MM', days:[0-6 (0=Sun)], dom:1-31, everyMinutes }
'use strict';

const { Cron } = require('croner');

const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;

function parseTime(s) {
  const m = HHMM.exec(String(s ?? '').trim());
  return m ? { h: Number(m[1]), m: Number(m[2]) } : null;
}

function isValidTz(tz) {
  if (!tz || typeof tz !== 'string') return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

// Cron pattern for calendar types; null for once/interval (or invalid). cron dow 0=Sun matches JS getDay().
function cronFor(schedule) {
  const t = schedule && schedule.time ? parseTime(schedule.time) : null;
  if (!schedule) return null;
  if (schedule.type === 'daily') {
    return t ? `${t.m} ${t.h} * * *` : null;
  }
  if (schedule.type === 'weekly') {
    if (!t || !Array.isArray(schedule.days)) return null;
    const days = [...new Set(schedule.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b);
    return days.length ? `${t.m} ${t.h} * * ${days.join(',')}` : null;
  }
  if (schedule.type === 'monthly') {
    if (!t || !Number.isInteger(schedule.dom) || schedule.dom < 1 || schedule.dom > 31) return null;
    return `${t.m} ${t.h} ${schedule.dom} * *`;
  }
  return null;
}

// Next fire time (epoch ms) strictly after fromMs, or null if none / expired / invalid.
function nextRunAt(schedule, fromMs = Date.now()) {
  if (!schedule || typeof schedule !== 'object') return null;
  if (schedule.type === 'once') {
    return typeof schedule.at === 'number' && schedule.at > fromMs ? schedule.at : null;
  }
  if (schedule.type === 'interval') {
    const mins = Number(schedule.everyMinutes);
    if (!Number.isFinite(mins) || mins <= 0) return null;
    return fromMs + Math.round(mins) * 60000;
  }
  const pattern = cronFor(schedule);
  if (!pattern) return null;
  const tz = isValidTz(schedule.tz) ? schedule.tz : 'UTC';
  try {
    const next = new Cron(pattern, { timezone: tz }).nextRun(new Date(fromMs));
    return next ? next.getTime() : null;
  } catch {
    return null;
  }
}

// One-time posts: resolve the next occurrence of month/day hour:minute in the given tz to an
// absolute epoch (ms), using croner so timezone + DST are handled. Returns ms or null.
// (Year is not part of cron — this means "the next time that date/time comes around", which is
// exactly the intent for a one-off announcement.)
function onceEpochFromDate({ month, day, hour, minute }, tz) {
  if (![month, day, hour, minute].every(Number.isInteger)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  const pattern = `${minute} ${hour} ${day} ${month} *`;
  try {
    const next = new Cron(pattern, { timezone: isValidTz(tz) ? tz : 'UTC' }).nextRun();
    return next ? next.getTime() : null;
  } catch {
    return null;
  }
}

// Validate + normalize a raw input into a stored schedule. Returns { ok, schedule } or { error }.
function validateSchedule(input, now = Date.now()) {
  if (!input || typeof input !== 'object') return { error: 'Missing schedule.' };
  const type = input.type;
  const tz = isValidTz(input.tz) ? input.tz : 'UTC';

  if (type === 'once') {
    const at = typeof input.at === 'number' ? input.at : NaN;
    if (!Number.isFinite(at)) return { error: 'A valid date & time is required.' };
    if (at <= now) return { error: 'That date/time is already in the past.' };
    return { ok: true, schedule: { type, tz, at } };
  }
  if (type === 'interval') {
    const everyMinutes = Number(input.everyMinutes);
    if (!Number.isFinite(everyMinutes) || everyMinutes < 1) return { error: 'Interval must be at least 1 minute.' };
    return { ok: true, schedule: { type, tz, everyMinutes: Math.round(everyMinutes) } };
  }

  const t = parseTime(input.time);
  if (!t) return { error: 'Time must be HH:MM in 24-hour format, e.g. 09:00.' };
  const time = `${String(t.h).padStart(2, '0')}:${String(t.m).padStart(2, '0')}`;

  if (type === 'daily') return { ok: true, schedule: { type, tz, time } };
  if (type === 'weekly') {
    const days = [...new Set((input.days || []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b);
    if (!days.length) return { error: 'Pick at least one day of the week.' };
    return { ok: true, schedule: { type, tz, time, days } };
  }
  if (type === 'monthly') {
    const dom = Number(input.dom);
    if (!Number.isInteger(dom) || dom < 1 || dom > 31) return { error: 'Day of month must be between 1 and 31.' };
    return { ok: true, schedule: { type, tz, time, dom } };
  }
  return { error: 'Unknown schedule type.' };
}

module.exports = { parseTime, isValidTz, cronFor, nextRunAt, validateSchedule, onceEpochFromDate };
