// src/logging/index.js — server logging listener module.
// Attaches gateway event listeners that emit styled embeds to per-guild log
// channels. All gating (master channel set, per-event toggle, per-event channel
// override) is delegated to ./config via the central emit() helper, so listeners
// only build descriptions. Every listener is wrapped in its own try/catch and
// never throws — one bad event can never crash the bot. Register via register(client).
'use strict';

const { Events, EmbedBuilder, AuditLogEvent, ChannelType } = require('discord.js');
const guildConfig = require('../core/guildConfig');
const { isEnabled, resolveChannelId } = require('./config');
const { fetchExecutor } = require('../core/auditlog');
const logger = require('../core/logger');

// Central emit: gate via config, resolve the destination channel, send the embed.
// Self-guarding — any failure is logged, never thrown.
async function emit(guild, key, { title, description, color = 0x5865f2, footer }) {
  try {
    if (!guild) return;
    const cfg = guildConfig.get(guild.id).logging;
    if (!isEnabled(cfg, key)) return; // gating: logging off, or this event disabled
    const chId = resolveChannelId(cfg, key);
    const ch = guild.channels.cache.get(chId) || (await guild.channels.fetch(chId).catch(() => null));
    if (!ch || typeof ch.send !== 'function') return;
    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(String(description ?? '').slice(0, 4096))
      .setColor(color)
      .setTimestamp();
    if (footer) embed.setFooter({ text: footer });
    await ch.send({ embeds: [embed], allowedMentions: { parse: [] } });
  } catch (e) {
    logger.error('[logging:emit]', e.message);
  }
}

// Truncate field-ish values so embed descriptions never blow the 4096 limit.
const trunc = (s, n = 1024) => {
  s = String(s ?? '');
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
};

function register(client) {
  // ── Messages ───────────────────────────────────────────────────────────────
  client.on(Events.MessageDelete, async (msg) => {
    try {
      if (!msg.guild) return;
      if (msg.author?.bot) return;
      await emit(msg.guild, 'messageDelete', {
        title: '🗑️ Message deleted',
        color: 0xe74c3c,
        description:
          `**Author:** ${msg.author ? `${msg.author.tag} (${msg.author.id})` : 'unknown'}\n` +
          `**Channel:** <#${msg.channelId}>\n` +
          `**Content:** ${msg.partial ? '*not cached*' : trunc(msg.content) || '*no text (embed/attachment)*'}`,
      });
    } catch (e) {
      logger.error('[logging:messageDelete]', e.message);
    }
  });

  client.on(Events.MessageUpdate, async (oldM, newM) => {
    try {
      if (!newM.guild || newM.author?.bot) return;
      const before = oldM.partial ? null : oldM.content;
      const after = newM.content;
      if (before === after) return;
      await emit(newM.guild, 'messageEdit', {
        title: '✏️ Message edited',
        color: 0xf1c40f,
        description:
          `**Author:** ${newM.author?.tag}\n` +
          `**Channel:** <#${newM.channelId}>\n` +
          `**Before:** ${before == null ? '*not cached*' : trunc(before)}\n` +
          `**After:** ${trunc(after)}\n` +
          `[Jump](${newM.url})`,
      });
    } catch (e) {
      logger.error('[logging:messageEdit]', e.message);
    }
  });

  client.on(Events.MessageBulkDelete, async (messages, channel) => {
    try {
      await emit(channel?.guild, 'messageBulkDelete', {
        title: '🗑️ Bulk delete',
        color: 0xe74c3c,
        description: `**Channel:** <#${channel?.id}>\n**Count:** ${messages.size}`,
      });
    } catch (e) {
      logger.error('[logging:messageBulkDelete]', e.message);
    }
  });

  // ── Channels ─────────────────────────────────────────────────────────────────
  client.on(Events.ChannelCreate, async (ch) => {
    try {
      if (!ch.guild) return;
      const ex = await fetchExecutor(ch.guild, AuditLogEvent.ChannelCreate, ch.id);
      await emit(ch.guild, 'channelCreate', {
        title: '📁 Channel created',
        color: 0x2ecc71,
        description:
          `**Channel:** ${ch.name} (<#${ch.id}>)\n` +
          `**Type:** ${ch.type}${ex?.executor ? `\n**By:** ${ex.executor.tag}` : ''}`,
      });
    } catch (e) {
      logger.error('[logging:channelCreate]', e.message);
    }
  });

  client.on(Events.ChannelDelete, async (ch) => {
    try {
      if (!ch.guild) return;
      const ex = await fetchExecutor(ch.guild, AuditLogEvent.ChannelDelete, ch.id);
      await emit(ch.guild, 'channelDelete', {
        title: '📁 Channel deleted',
        color: 0xe74c3c,
        description:
          `**Channel:** ${ch.name}\n` +
          `**Type:** ${ch.type}${ex?.executor ? `\n**By:** ${ex.executor.tag}` : ''}`,
      });
    } catch (e) {
      logger.error('[logging:channelDelete]', e.message);
    }
  });

  client.on(Events.ChannelUpdate, async (oldC, newC) => {
    try {
      if (!newC.guild) return;
      if (oldC.name === newC.name) return;
      await emit(newC.guild, 'channelUpdate', {
        title: '📁 Channel renamed',
        color: 0xf1c40f,
        description: `**Before:** ${oldC.name}\n**After:** ${newC.name}`,
      });
    } catch (e) {
      logger.error('[logging:channelUpdate]', e.message);
    }
  });

  // ── Roles ──────────────────────────────────────────────────────────────────
  client.on(Events.GuildRoleCreate, async (role) => {
    try {
      const ex = await fetchExecutor(role.guild, AuditLogEvent.RoleCreate, role.id);
      await emit(role.guild, 'roleCreate', {
        title: '🎭 Role created',
        color: 0x2ecc71,
        description: `**Role:** ${role.name}${ex?.executor ? `\n**By:** ${ex.executor.tag}` : ''}`,
      });
    } catch (e) {
      logger.error('[logging:roleCreate]', e.message);
    }
  });

  client.on(Events.GuildRoleDelete, async (role) => {
    try {
      const ex = await fetchExecutor(role.guild, AuditLogEvent.RoleDelete, role.id);
      await emit(role.guild, 'roleDelete', {
        title: '🎭 Role deleted',
        color: 0xe74c3c,
        description: `**Role:** ${role.name}${ex?.executor ? `\n**By:** ${ex.executor.tag}` : ''}`,
      });
    } catch (e) {
      logger.error('[logging:roleDelete]', e.message);
    }
  });

  client.on(Events.GuildRoleUpdate, async (oldR, newR) => {
    try {
      const changes = [];
      if (oldR.name !== newR.name) changes.push(`name: ${oldR.name} → ${newR.name}`);
      if (oldR.color !== newR.color) changes.push('color changed');
      if (oldR.permissions.bitfield !== newR.permissions.bitfield) changes.push('permissions changed');
      if (!changes.length) return;
      await emit(newR.guild, 'roleUpdate', {
        title: '🎭 Role updated',
        color: 0xf1c40f,
        description: `**Role:** ${newR.name}\n${changes.join('\n')}`,
      });
    } catch (e) {
      logger.error('[logging:roleUpdate]', e.message);
    }
  });

  // ── Members: join / leave ────────────────────────────────────────────────────
  client.on(Events.GuildMemberAdd, async (member) => {
    try {
      const created = Math.floor(member.user.createdTimestamp / 1000);
      await emit(member.guild, 'memberJoin', {
        title: '📥 Member joined',
        color: 0x2ecc71,
        description:
          `**User:** ${member.user.tag} (${member.id})\n` +
          `**Account created:** <t:${created}:R>\n` +
          `**Members:** ${member.guild.memberCount}`,
      });
    } catch (e) {
      logger.error('[logging:memberJoin]', e.message);
    }
  });

  client.on(Events.GuildMemberRemove, async (member) => {
    try {
      const roles = member.roles?.cache
        ? [...member.roles.cache.filter((r) => r.id !== member.guild.id).values()].map((r) => r.name).join(', ')
        : '';
      await emit(member.guild, 'memberLeave', {
        title: '📤 Member left',
        color: 0xe67e22,
        description: `**User:** ${member.user.tag} (${member.id})\n**Roles:** ${roles || 'none'}`,
      });
    } catch (e) {
      logger.error('[logging:memberLeave]', e.message);
    }
  });

  // ── Bans ─────────────────────────────────────────────────────────────────────
  client.on(Events.GuildBanAdd, async (ban) => {
    try {
      const ex = await fetchExecutor(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
      await emit(ban.guild, 'memberBan', {
        title: '⛔ Member banned',
        color: 0xe74c3c,
        description: `**User:** ${ban.user.tag} (${ban.user.id})${ex?.executor ? `\n**By:** ${ex.executor.tag}` : ''}`,
      });
    } catch (e) {
      logger.error('[logging:memberBan]', e.message);
    }
  });

  client.on(Events.GuildBanRemove, async (ban) => {
    try {
      const ex = await fetchExecutor(ban.guild, AuditLogEvent.MemberBanRemove, ban.user.id);
      await emit(ban.guild, 'memberUnban', {
        title: '✅ Member unbanned',
        color: 0x2ecc71,
        description: `**User:** ${ban.user.tag} (${ban.user.id})${ex?.executor ? `\n**By:** ${ex.executor.tag}` : ''}`,
      });
    } catch (e) {
      logger.error('[logging:memberUnban]', e.message);
    }
  });

  // ── Member updates: nickname / timeout / roles (three independent aspects) ─────
  client.on(Events.GuildMemberUpdate, async (oldM, newM) => {
    try {
      // (a) nickname
      if (oldM.nickname !== newM.nickname) {
        await emit(newM.guild, 'nicknameChange', {
          title: '✏️ Nickname changed',
          color: 0x1abc9c,
          description:
            `**User:** ${newM.user.tag}\n` +
            `**Before:** ${oldM.nickname || '*none*'}\n` +
            `**After:** ${newM.nickname || '*none*'}`,
        });
      }

      // (b) timeout
      const ot = oldM.communicationDisabledUntilTimestamp || 0;
      const nt = newM.communicationDisabledUntilTimestamp || 0;
      if (ot !== nt) {
        await emit(newM.guild, 'memberTimeout', {
          title: nt > Date.now() ? '🔇 Member timed out' : '🔊 Timeout removed',
          color: 0xe67e22,
          description: `**User:** ${newM.user.tag}${nt > Date.now() ? `\n**Until:** <t:${Math.floor(nt / 1000)}:R>` : ''}`,
        });
      }

      // (c) roles
      const before = new Set(oldM.roles.cache.keys());
      const after = new Set(newM.roles.cache.keys());
      const added = [...after].filter((id) => !before.has(id));
      const removed = [...before].filter((id) => !after.has(id));
      if (added.length || removed.length) {
        const fmt = (ids) => ids.map((id) => `<@&${id}>`).join(', ');
        await emit(newM.guild, 'roleChange', {
          title: '🎭 Member roles changed',
          color: 0x9b59b6,
          description:
            `**User:** ${newM.user.tag}` +
            `${added.length ? `\n**+** ${fmt(added)}` : ''}` +
            `${removed.length ? `\n**−** ${fmt(removed)}` : ''}`,
        });
      }
    } catch (e) {
      logger.error('[logging:memberUpdate]', e.message);
    }
  });

  // ── Voice ──────────────────────────────────────────────────────────────────
  client.on(Events.VoiceStateUpdate, async (oldS, newS) => {
    try {
      const guild = newS.guild;
      if (!oldS.channelId && newS.channelId) {
        await emit(guild, 'voiceActivity', {
          title: '🔊 Joined voice',
          color: 0x2ecc71,
          description: `**User:** <@${newS.id}>\n**Channel:** ${newS.channel?.name}`,
        });
      } else if (oldS.channelId && !newS.channelId) {
        await emit(guild, 'voiceActivity', {
          title: '🔇 Left voice',
          color: 0xe67e22,
          description: `**User:** <@${newS.id}>\n**Channel:** ${oldS.channel?.name}`,
        });
      } else if (oldS.channelId && newS.channelId && oldS.channelId !== newS.channelId) {
        await emit(guild, 'voiceActivity', {
          title: '↔️ Moved voice',
          color: 0xf1c40f,
          description: `**User:** <@${newS.id}>\n**From:** ${oldS.channel?.name}\n**To:** ${newS.channel?.name}`,
        });
      }
    } catch (e) {
      logger.error('[logging:voiceActivity]', e.message);
    }
  });

  // ── Invites ──────────────────────────────────────────────────────────────────
  client.on(Events.InviteCreate, async (invite) => {
    try {
      await emit(invite.guild, 'inviteCreate', {
        title: '🔗 Invite created',
        color: 0x3498db,
        description:
          `**Code:** ${invite.code}\n` +
          `**Channel:** <#${invite.channelId}>\n` +
          `**By:** ${invite.inviter?.tag || 'unknown'}\n` +
          `**Max uses:** ${invite.maxUses || '∞'}`,
      });
    } catch (e) {
      logger.error('[logging:inviteCreate]', e.message);
    }
  });

  // ── Emojis ─────────────────────────────────────────────────────────────────
  client.on(Events.GuildEmojiCreate, async (e) => {
    try {
      await emit(e.guild, 'emojiChange', {
        title: '😀 Emoji added',
        color: 0x2ecc71,
        description: `**Emoji:** ${e.name}`,
      });
    } catch (err) {
      logger.error('[logging:emojiCreate]', err.message);
    }
  });

  client.on(Events.GuildEmojiDelete, async (e) => {
    try {
      await emit(e.guild, 'emojiChange', {
        title: '😀 Emoji removed',
        color: 0xe74c3c,
        description: `**Emoji:** ${e.name}`,
      });
    } catch (err) {
      logger.error('[logging:emojiDelete]', err.message);
    }
  });

  client.on(Events.GuildEmojiUpdate, async (oldE, newE) => {
    try {
      if (oldE.name === newE.name) return;
      await emit(newE.guild, 'emojiChange', {
        title: '😀 Emoji renamed',
        color: 0xf1c40f,
        description: `${oldE.name} → ${newE.name}`,
      });
    } catch (err) {
      logger.error('[logging:emojiUpdate]', err.message);
    }
  });

  // ── Stickers ─────────────────────────────────────────────────────────────────
  client.on(Events.GuildStickerCreate, async (s) => {
    try {
      await emit(s.guild, 'stickerChange', {
        title: '🏷️ Sticker added',
        color: 0x2ecc71,
        description: `**Sticker:** ${s.name}`,
      });
    } catch (err) {
      logger.error('[logging:stickerCreate]', err.message);
    }
  });

  client.on(Events.GuildStickerDelete, async (s) => {
    try {
      await emit(s.guild, 'stickerChange', {
        title: '🏷️ Sticker removed',
        color: 0xe74c3c,
        description: `**Sticker:** ${s.name}`,
      });
    } catch (err) {
      logger.error('[logging:stickerDelete]', err.message);
    }
  });

  client.on(Events.GuildStickerUpdate, async (oldS, newS) => {
    try {
      if (oldS.name === newS.name) return;
      await emit(newS.guild, 'stickerChange', {
        title: '🏷️ Sticker renamed',
        color: 0xf1c40f,
        description: `${oldS.name} → ${newS.name}`,
      });
    } catch (err) {
      logger.error('[logging:stickerUpdate]', err.message);
    }
  });
}

module.exports = { register };
