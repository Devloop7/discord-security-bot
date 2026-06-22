// src/core/scheduler.js — durable timers persisted to scheduler.json; survive restarts.
const store = require('./store');
const logger = require('./logger');
const FILE = 'scheduler.json';

const handlers = new Map(); // type -> async (data, client) => {}
const timers = new Map();    // jobId -> timeout
let client = null;
let seq = 0;

function jobs() { return store.read(FILE, { jobs: [] }).jobs || []; }
function saveJobs(list) { store.write(FILE, { jobs: list }); }
function register(type, fn) { handlers.set(type, fn); }

async function run(job) {
  timers.delete(job.id);
  saveJobs(jobs().filter((j) => j.id !== job.id)); // remove before running so a crash can't loop
  const fn = handlers.get(job.type);
  if (!fn) { logger.warn(`[scheduler] no handler for ${job.type}`); return; }
  try { await fn(job.data, client); }
  catch (e) { logger.error(`[scheduler] ${job.type} failed:`, e.message); }
}

function arm(job) {
  const delay = Math.max(0, job.runAt - Date.now());
  if (delay > 2_147_000_000) return; // beyond setTimeout max (~24.8d); re-armed next boot
  const t = setTimeout(() => run(job), delay);
  if (t.unref) t.unref();
  timers.set(job.id, t);
}

function schedule(type, runAt, data) {
  const job = { id: `${type}:${Date.now()}:${++seq}`, type, runAt, data };
  saveJobs([...jobs(), job]);
  if (client) arm(job);
  return job.id;
}

function cancel(id) {
  const t = timers.get(id);
  if (t) { clearTimeout(t); timers.delete(id); }
  saveJobs(jobs().filter((j) => j.id !== id));
}

async function init(c) {
  client = c;
  const now = Date.now();
  for (const job of jobs()) {
    if (job.runAt <= now) await run(job); else arm(job);
  }
}

function hasJob(type, predicate) {
  return jobs().some((j) => j.type === type && (!predicate || predicate(j.data)));
}

module.exports = { register, schedule, cancel, init, hasJob, jobs };
