// src/protection/automod.js — the per-guild automod engine.
//
// Always-on flood/mention protection lives in spam.js; this is the OPT-IN layer
// where every check defaults OFF and is toggled per guild via guildConfig.automod.
//
// Stateless content checks (caps/emoji/mentions/regex/nsfwLinks) come from
// automodChecks.detectContent. The two stateful checks (flood, duplicate) need a
// sliding window keyed by per-guild config, so they're tracked here with manual
// timestamp arrays rather than the shared RateWindow (whose window is fixed).
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Events } = require('discord.js');
const guildConfig = require('../core/guildConfig');
const { detectContent } = require('./automodChecks');
const actioned = require('./actioned');
const strikes = require('../core/strikes');
const { nextTimeout } = require('../core/escalate');
const { isTrusted } = require('../core/whitelist');
const modlog = require('../core/modlog');
const logger = require('../core/logger');

const nsfwDomains = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'nsfw-domains.json'), 'utf8'));

// Per-guild sliding windows (manual, since the window length is guild-configurable).
const floodTimes = new Map(); // key = guildId+':'+userId             -> number[] timestamps
const dupTimes = new Map();   // key = guildId+':'+userId+':'+norm     -> number[] timestamps

// Keep only timestamps newer than the window.
function prune(arr, windowMs, now) {
  return arr.filter((t) => now - t < windowMs);
}

function register(client) {
  client.on(Events.MessageCreate, async (msg) => {
    try {
      if (msg.author.bot || !msg.guild || !msg.content) return;
      if (isTrusted(msg.member)) return;

      const cfg = guildConfig.get(msg.guild.id).automod;
      if (cfg.ignoredChannelIds?.includes(msg.channelId)) return;
      if (msg.member && cfg.whitelistRoleIds?.length
        && msg.member.roles.cache.some((r) => cfg.whitelistRoleIds.includes(r.id))) return;

      const mentionCount = msg.mentions.users.size + msg.mentions.roles.size;
      let violation = detectContent({ content: msg.content, mentionCount }, cfg, nsfwDomains);
      const now = Date.now();

      // stateful: flood — too many messages from one user inside the window.
      if (!violation && cfg.flood?.enabled) {
        const key = `${msg.guild.id}:${msg.author.id}`;
        const win = (cfg.flood.windowSec || 5) * 1000;
        const arr = prune(floodTimes.get(key) || [], win, now);
        arr.push(now);
        floodTimes.set(key, arr);
        if (arr.length > (cfg.flood.max || 6)) {
          violation = { type: 'flood', detail: `${arr.length} msgs/${cfg.flood.windowSec}s` };
          floodTimes.set(key, []);
        }
      }

      // stateful: duplicate — same normalized content repeated inside the window.
      if (!violation && cfg.duplicate?.enabled) {
        const norm = msg.content.trim().toLowerCase().slice(0, 200);
        const key = `${msg.guild.id}:${msg.author.id}:${norm}`;
        const win = (cfg.duplicate.windowSec || 30) * 1000;
        const arr = prune(dupTimes.get(key) || [], win, now);
        arr.push(now);
        dupTimes.set(key, arr);
        if (arr.length >= 2) {
          violation = { type: 'duplicate', detail: 'repeated message' };
        }
      }

      if (!violation) return;
      if (!actioned.claim(msg.id)) return; // another filter already handled it

      await msg.delete().catch(() => {});

      const count = strikes.add(msg.author.id, 'automod', (cfg.strikeDecayDays || 0) * 86400000);
      let action = 'warned';
      if (count >= 2) {
        const ms = nextTimeout(count - 1, cfg.timeoutSteps || ['5m', '1h', '1d']);
        if (ms > 0 && msg.member?.moderatable) {
          await msg.member.timeout(ms, `Automod: ${violation.type}`).catch(() => {});
          action = 'muted';
        }
      }

      msg.channel.send({
        content: `${msg.author}, that message broke an automod rule (${violation.type}). You have been ${action}.`,
        allowedMentions: { parse: ['users'] },
      }).then((m) => setTimeout(() => m.delete().catch(() => {}), 6000)).catch(() => {});

      await modlog.log(msg.guild, {
        title: '🛡️ Automod',
        description: `**User:** ${msg.author.tag} (${msg.author.id})\n**Rule:** ${violation.type} — ${violation.detail}\n**Strike:** ${count}\n**Action:** ${action}`,
        color: 0xE67E22,
      });
    } catch (e) {
      logger.error('[automod]', e.message);
    }
  });
}

module.exports = { register };
