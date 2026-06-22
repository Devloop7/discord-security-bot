// src/protection/automodChecks.js — pure content-analysis checks for the automod
// engine. Stateless: every function takes primitives and returns a verdict, so the
// whole detection surface is unit-testable without a Discord client.
//
// Stateful checks (flood, duplicate) need a sliding window and live in automod.js;
// here we only expose the threshold-free content analysers + a combined detector.
'use strict';

const { domainsOf } = require('./linkscan');

const MAX_REGEX_SOURCE = 200; // cap pattern length to bound ReDoS exposure

// ── caps ─────────────────────────────────────────────────────────────────────
// Violates when there are at least minLength letters AND the uppercase share
// (of letters only — digits/punctuation ignored) reaches `percent`.
function checkCaps(content, { minLength = 10, percent = 70 } = {}) {
  const letters = String(content).match(/[a-zA-Z]/g) || [];
  if (letters.length < minLength) return false;
  const uppers = String(content).match(/[A-Z]/g) || [];
  return (uppers.length / letters.length) * 100 >= percent;
}

// ── emoji ────────────────────────────────────────────────────────────────────
// Counts unicode pictographs + custom <:name:id> / <a:name:id> emoji.
function countEmoji(content) {
  const s = String(content);
  const unicode = (s.match(/\p{Extended_Pictographic}/gu) || []).length;
  const custom = (s.match(/<a?:\w+:\d+>/g) || []).length;
  return unicode + custom;
}
function checkEmoji(content, { max = 8 } = {}) {
  return countEmoji(content) > max;
}

// ── mentions (count is computed by the caller from msg.mentions) ──────────────
function checkMentions(mentionCount, { max = 5 } = {}) {
  return Number(mentionCount) > max;
}

// ── regex filters ──────────────────────────────────────────────────────────────
// Compile an admin-supplied pattern safely; returns a RegExp or null if invalid.
function compilePattern(p) {
  try {
    const source = typeof p === 'string' ? p : p.source;
    const flags = (typeof p === 'object' && p.flags) ? p.flags.replace(/[^gimsuy]/g, '') : 'i';
    if (!source || source.length > MAX_REGEX_SOURCE) return null;
    return new RegExp(source, flags.includes('i') ? flags : flags + 'i');
  } catch {
    return null;
  }
}
// patterns: array of {source, flags} (or strings). Returns the matched source, or null.
function checkRegex(content, patterns) {
  for (const p of patterns || []) {
    const re = compilePattern(p);
    if (re && re.test(String(content))) return typeof p === 'string' ? p : p.source;
  }
  return null;
}

// ── NSFW links ─────────────────────────────────────────────────────────────────
// Matches an exact host or any subdomain of a blocked host.
function checkNsfwLink(content, nsfwDomains) {
  const list = nsfwDomains || [];
  return domainsOf(content).some((d) => list.some((nd) => d === nd || d.endsWith(`.${nd}`)));
}

// ── combined content detector (stateless checks only) ────────────────────────
// Runs the enabled content checks in priority order; returns { type, detail } | null.
// Flood + duplicate are evaluated separately by the stateful engine.
function detectContent({ content, mentionCount = 0 }, cfg, nsfwDomains) {
  if (!cfg) return null;
  if (cfg.nsfwLinks?.enabled && checkNsfwLink(content, nsfwDomains)) return { type: 'nsfwLinks', detail: 'NSFW link' };
  if (cfg.regex?.enabled) {
    const m = checkRegex(content, cfg.regex.patterns);
    if (m) return { type: 'regex', detail: `matched /${m}/` };
  }
  if (cfg.mentions?.enabled && checkMentions(mentionCount, cfg.mentions)) return { type: 'mentions', detail: `${mentionCount} mentions` };
  if (cfg.caps?.enabled && checkCaps(content, cfg.caps)) return { type: 'caps', detail: 'excessive caps' };
  if (cfg.emoji?.enabled && checkEmoji(content, cfg.emoji)) return { type: 'emoji', detail: 'excessive emoji' };
  return null;
}

module.exports = {
  MAX_REGEX_SOURCE,
  checkCaps, countEmoji, checkEmoji, checkMentions, compilePattern, checkRegex, checkNsfwLink, detectContent,
};
