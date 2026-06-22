// src/autoresponder/events.js — listen for messages and fire autoresponders.
// Register with client via register(client).
'use strict';

const { Events } = require('discord.js');
const guildConfig = require('../core/guildConfig');
const logger = require('../core/logger');

// In-memory per-channel cooldown to avoid loops/spam.
const COOLDOWN_MS = 3_000;
const lastReply = new Map(); // channelId → timestamp

function matches(content, trigger, mode) {
  const t = String(trigger || '').toLowerCase();
  if (!t) return false;
  if (mode === 'exact') return content === t;
  if (mode === 'starts') return content.startsWith(t);
  // default: contains
  return content.includes(t);
}

function register(client) {
  client.on(Events.MessageCreate, async (msg) => {
    try {
      // Ignore bots, system messages and DMs.
      if (msg.author?.bot) return;
      if (msg.system) return;
      if (!msg.guild || !msg.guildId) return;

      const list = guildConfig.get(msg.guildId).autoresponders || [];
      if (list.length === 0) return;

      const content = (msg.content || '').toLowerCase();
      if (!content) return;

      const match = list.find((a) => matches(content, a.trigger, a.match));
      if (!match) return;

      // Per-channel cooldown.
      const now = Date.now();
      const last = lastReply.get(msg.channelId) || 0;
      if (now - last < COOLDOWN_MS) return;
      lastReply.set(msg.channelId, now);

      await msg
        .reply({ content: match.response, allowedMentions: { repliedUser: false } })
        .catch(() => {});
    } catch (e) {
      logger.error('[autoresponder:event]', e.message);
    }
  });
}

module.exports = { register };
