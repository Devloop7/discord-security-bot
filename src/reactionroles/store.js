// src/reactionroles/store.js — config + rendering + pure role-resolution for self-roles.
//
// A "group" is one message that grants roles. It is keyed by the message id in
// guildConfig.reactionRoles, so a button/select interaction maps back via
// interaction.message.id (fully persistent — no in-memory state, survives restarts):
//   reactionRoles: { "<messageId>": { channelId, title, color, mode, roles: [ {roleId, label, emoji} ] } }
//
// Modes:
//   normal  — toggle, multiple roles allowed
//   unique  — at most one role from the group (picking one removes the others)
//   verify  — one-way grant (clicking grants; clicking again does nothing)
//
// UI: ≤5 roles → buttons; 6–25 → a string select menu. customIds:
//   button  -> 'rr:<roleId>'
//   select  -> 'rr:select'  (values are roleIds)
'use strict';

const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
} = require('discord.js');
const guildConfig = require('../core/guildConfig');

const MODES = ['normal', 'unique', 'verify'];
const MAX_ROLES = 25;

function getGroup(guildId, messageId) {
  return guildConfig.get(guildId).reactionRoles[messageId] || null;
}

// Persist a full group object under its message id. guildConfig deep-merges, but we
// always pass the complete group so the roles array is replaced wholesale.
function saveGroup(guildId, messageId, group) {
  return guildConfig.set(guildId, { reactionRoles: { [messageId]: group } });
}

// ── rendering ────────────────────────────────────────────────────────────────
function buildEmbed(group) {
  const lines = group.roles.length
    ? group.roles.map((r) => `${r.emoji ? r.emoji + ' ' : ''}<@&${r.roleId}>`).join('\n')
    : '*No roles configured yet — add some with `/reactionroles add`.*';
  const modeNote = { normal: 'Pick any that apply.', unique: 'Pick one.', verify: 'Click to verify.' }[group.mode] || '';
  return new EmbedBuilder()
    .setTitle(group.title || 'Self Roles')
    .setDescription(`${lines}\n\n*${modeNote}*`)
    .setColor(typeof group.color === 'number' ? group.color : 0x5865F2);
}

// Returns an array of ActionRows (empty if no roles). ≤5 → buttons; else a select menu.
function buildComponents(group) {
  const roles = group.roles.slice(0, MAX_ROLES);
  if (roles.length === 0) return [];

  if (roles.length <= 5) {
    const row = new ActionRowBuilder();
    for (const r of roles) {
      const btn = new ButtonBuilder()
        .setCustomId(`rr:${r.roleId}`)
        .setStyle(group.mode === 'verify' ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setLabel((r.label || 'Role').slice(0, 80));
      if (r.emoji) btn.setEmoji(r.emoji);
      row.addComponents(btn);
    }
    return [row];
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId('rr:select')
    .setMinValues(0)
    .setMaxValues(group.mode === 'unique' ? 1 : roles.length);
  for (const r of roles) {
    const opt = { label: (r.label || 'Role').slice(0, 100), value: r.roleId };
    if (r.emoji) opt.emoji = r.emoji;
    menu.addOptions(opt);
  }
  return [new ActionRowBuilder().addComponents(menu)];
}

// ── pure role-resolution (unit-tested) ───────────────────────────────────────
// Button click → which roles to add/remove for this member.
function resolveButton(group, roleId, memberHasRole) {
  if (group.mode === 'verify') {
    return memberHasRole ? { add: [], remove: [] } : { add: [roleId], remove: [] };
  }
  if (group.mode === 'unique') {
    if (memberHasRole) return { add: [], remove: [roleId] };
    const others = group.roles.map((r) => r.roleId).filter((id) => id !== roleId);
    return { add: [roleId], remove: others };
  }
  // normal: toggle
  return memberHasRole ? { add: [], remove: [roleId] } : { add: [roleId], remove: [] };
}

// Select submit → member ends with exactly the selected roles within this group.
function resolveSelect(group, selectedRoleIds, memberRoleIds) {
  const groupIds = group.roles.map((r) => r.roleId);
  const selected = new Set(selectedRoleIds.filter((id) => groupIds.includes(id)));
  const add = [...selected].filter((id) => !memberRoleIds.includes(id));
  const remove = groupIds.filter((id) => !selected.has(id) && memberRoleIds.includes(id));
  return { add, remove };
}

module.exports = {
  MODES, MAX_ROLES, getGroup, saveGroup,
  buildEmbed, buildComponents, resolveButton, resolveSelect,
};
