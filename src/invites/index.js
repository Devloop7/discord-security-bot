// src/invites/index.js — invite-tracking listeners + the live per-guild invite-use cache.
//
// This module owns the in-memory cache of invite uses (it needs the client to fetch
// invites) and wires up the Discord gateway listeners. The persistence + the pure
// invite-diff live in ./tracker.js — we require and use it, never reimplement it.
//
// Flow on a join:
//   1. snapshot the cache (pre-join uses), 2. re-fetch live invites,
//   3. diff via tracker.findUsedInvite to find which code went up,
//   4. map that code → inviterId, classify fake/real by account age,
//   5. tracker.recordJoin + optionally post to the configured log channel.
//
// module.exports = { register, seedGuild }
'use strict';

const { Events, MessageFlags } = require('discord.js'); // eslint-disable-line no-unused-vars
const guildConfig = require('../core/guildConfig');
const tracker = require('./tracker');
const logger = require('../core/logger');

// guildId -> { code: uses }. The "last known" invite-use snapshot per guild.
const cache = new Map();
// guildIds we've established a baseline for; until seeded we can't attribute a join.
const seeded = new Set();

const DAY_MS = 86400000;

// Fetch the guild's invites into plain maps. Returns { useMap: {code:uses}, inviterMap: {code:inviterId} }.
// Swallows errors (missing ManageGuild permission or a transient gateway hiccup) → empty maps.
async function fetchInvites(guild) {
  const useMap = {};
  const inviterMap = {};
  try {
    const invites = await guild.invites.fetch();
    for (const inv of invites.values()) {
      useMap[inv.code] = inv.uses || 0;
      inviterMap[inv.code] = inv.inviterId || inv.inviter?.id || null;
    }
  } catch {
    /* missing ManageGuild or transient — leave maps empty */
  }
  return { useMap, inviterMap };
}

// Establish (or refresh) the use-count baseline for a guild so the next join is attributable.
async function seedGuild(guild) {
  const { useMap } = await fetchInvites(guild);
  cache.set(guild.id, useMap);
  seeded.add(guild.id);
}

function register(client) {
  // Seed every invite-enabled guild on startup so the first post-restart join is attributable.
  client.on(Events.ClientReady, async (c) => {
    try {
      for (const guild of c.guilds.cache.values()) {
        try {
          if (guildConfig.get(guild.id).invites.enabled) {
            await seedGuild(guild);
          }
        } catch (e) {
          logger.error('[invites:seed]', `${guild.id}: ${e.message}`);
        }
      }
    } catch (e) {
      logger.error('[invites:ready]', e.message);
    }
  });

  // A new invite was created — track it immediately so we don't mis-attribute the join that uses it.
  client.on(Events.InviteCreate, async (invite) => {
    try {
      if (!invite.guild) return;
      const m = cache.get(invite.guild.id) || {};
      m[invite.code] = invite.uses || 0;
      cache.set(invite.guild.id, m);
    } catch (e) {
      logger.error('[invites:create]', e.message);
    }
  });

  // An invite was deleted — drop it from the cache so a later code reuse can't false-positive.
  client.on(Events.InviteDelete, async (invite) => {
    try {
      const m = cache.get(invite.guild?.id);
      if (m) delete m[invite.code];
    } catch (e) {
      logger.error('[invites:delete]', e.message);
    }
  });

  // Member joins — attribute to the invite whose use count went up.
  client.on(Events.GuildMemberAdd, async (member) => {
    try {
      const guild = member.guild;
      const cfg = guildConfig.get(guild.id).invites;
      if (!cfg.enabled) return;

      const oldMap = cache.get(guild.id);
      const { useMap, inviterMap } = await fetchInvites(guild);
      cache.set(guild.id, useMap);

      // No baseline yet (joined a guild we hadn't seeded) — seed only, skip this attribution.
      if (!seeded.has(guild.id)) {
        seeded.add(guild.id);
        return;
      }

      const code = tracker.findUsedInvite(oldMap || {}, useMap);
      const inviterId = code ? inviterMap[code] : null;
      if (!inviterId) return; // vanity URL / undeterminable — don't credit anyone.

      const isFake = (Date.now() - member.user.createdTimestamp) < (cfg.fakeAgeDays || 7) * DAY_MS;
      await tracker.recordJoin(guild.id, inviterId, member.id, isFake);

      if (cfg.logChannelId) {
        const ch =
          guild.channels.cache.get(cfg.logChannelId) ||
          (await guild.channels.fetch(cfg.logChannelId).catch(() => null));
        if (ch && typeof ch.send === 'function') {
          const s = tracker.getStats(guild.id, inviterId);
          await ch.send({
            content:
              `📥 <@${member.id}> joined — invited by <@${inviterId}> ` +
              `(${s.real + s.fake} invites${isFake ? ', fake' : ''})`,
            allowedMentions: { parse: [] },
          });
        }
      }
    } catch (e) {
      logger.error('[invites:join]', e.message);
    }
  });

  // Member leaves — decrement the inviter's bucket and bump their 'left' counter.
  client.on(Events.GuildMemberRemove, async (member) => {
    try {
      const cfg = guildConfig.get(member.guild.id).invites;
      if (!cfg.enabled) return;
      await tracker.recordLeave(member.guild.id, member.id);
    } catch (e) {
      logger.error('[invites:leave]', e.message);
    }
  });
}

module.exports = { register, seedGuild };
