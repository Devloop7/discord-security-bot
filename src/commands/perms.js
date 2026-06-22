// src/commands/perms.js — /perms: manage per-command access + staff levels (mod command).
// No bypassModGate: the dispatcher gates this behind canRun (owner/ManageGuild/staff).
// All state lives in guildConfig.permissions; access.canRun reads it on every command.
//
//   permissions: {
//     commandOverrides: { <command>: { allowedRoleIds[], deniedRoleIds[], disabled } },
//     staffLevels: { mod: [roleIds], admin: [roleIds] },
//   }
'use strict';

const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');
const guildConfig = require('../core/guildConfig');
const logger = require('../core/logger');

const EMBED_COLOR = 0x5865F2;

// Resolve the live set of command names lazily (require at call time to dodge the
// circular dependency between this file and ./index, which requires this file).
function knownCommands() {
  try {
    const { commandModules } = require('./index');
    return commandModules.map((c) => c.data.name);
  } catch {
    return [];
  }
}

const data = new SlashCommandBuilder()
  .setName('perms')
  .setDescription('Manage who can use which commands (per-command roles + staff levels)')
  .addSubcommand((s) => s.setName('allow').setDescription('Let a role use a command (even if not staff)')
    .addStringOption((o) => o.setName('command').setDescription('Command name, e.g. ban').setRequired(true))
    .addRoleOption((o) => o.setName('role').setDescription('Role to allow').setRequired(true)))
  .addSubcommand((s) => s.setName('deny').setDescription('Block a role from a command (overrides staff)')
    .addStringOption((o) => o.setName('command').setDescription('Command name').setRequired(true))
    .addRoleOption((o) => o.setName('role').setDescription('Role to deny').setRequired(true)))
  .addSubcommand((s) => s.setName('clear').setDescription('Clear all overrides for a command')
    .addStringOption((o) => o.setName('command').setDescription('Command name').setRequired(true)))
  .addSubcommand((s) => s.setName('disable').setDescription('Disable a command server-wide (owner can still run it)')
    .addStringOption((o) => o.setName('command').setDescription('Command name').setRequired(true)))
  .addSubcommand((s) => s.setName('enable').setDescription('Re-enable a previously disabled command')
    .addStringOption((o) => o.setName('command').setDescription('Command name').setRequired(true)))
  .addSubcommand((s) => s.setName('level').setDescription('Add/remove a staff-level role (grants all mod commands)')
    .addStringOption((o) => o.setName('level').setDescription('Staff level').setRequired(true)
      .addChoices({ name: 'mod', value: 'mod' }, { name: 'admin', value: 'admin' }))
    .addStringOption((o) => o.setName('action').setDescription('add or remove').setRequired(true)
      .addChoices({ name: 'add', value: 'add' }, { name: 'remove', value: 'remove' }))
    .addRoleOption((o) => o.setName('role').setDescription('Role').setRequired(true)))
  .addSubcommand((s) => s.setName('status').setDescription('Show current command permissions + staff levels'));

// Read the (possibly absent) override object for a command.
function overrideFor(gid, command) {
  const ov = guildConfig.get(gid).permissions.commandOverrides[command];
  return { allowedRoleIds: [], deniedRoleIds: [], disabled: false, ...(ov || {}) };
}

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const gid = interaction.guildId;
  const reply = (content) => interaction.reply({ content, flags: MessageFlags.Ephemeral });

  try {
    // Validate the named command for everything except `status`/`level`.
    if (['allow', 'deny', 'clear', 'disable', 'enable'].includes(sub)) {
      const command = interaction.options.getString('command').toLowerCase().trim();
      const known = knownCommands();
      if (known.length && !known.includes(command)) {
        return reply(`⚠️ Unknown command \`${command}\`. Check the spelling (no leading slash).`);
      }

      if (sub === 'allow' || sub === 'deny') {
        const role = interaction.options.getRole('role');
        const ov = overrideFor(gid, command);
        const key = sub === 'allow' ? 'allowedRoleIds' : 'deniedRoleIds';
        if (ov[key].includes(role.id)) return reply(`<@&${role.id}> is already in the **${sub}** list for \`${command}\`.`);
        const next = [...ov[key], role.id];
        guildConfig.set(gid, { permissions: { commandOverrides: { [command]: { [key]: next } } } });
        return reply(`✅ ${sub === 'allow' ? 'Allowed' : 'Denied'} <@&${role.id}> for \`${command}\`.`);
      }

      if (sub === 'clear') {
        guildConfig.set(gid, { permissions: { commandOverrides: { [command]: { allowedRoleIds: [], deniedRoleIds: [], disabled: false } } } });
        return reply(`✅ Cleared all overrides for \`${command}\`.`);
      }

      // disable / enable
      const disabled = sub === 'disable';
      guildConfig.set(gid, { permissions: { commandOverrides: { [command]: { disabled } } } });
      return reply(`✅ \`${command}\` is now **${disabled ? 'disabled' : 'enabled'}**.`);
    }

    if (sub === 'level') {
      const level = interaction.options.getString('level'); // 'mod' | 'admin'
      const action = interaction.options.getString('action'); // 'add' | 'remove'
      const role = interaction.options.getRole('role');
      const current = guildConfig.get(gid).permissions.staffLevels[level] || [];
      if (action === 'add') {
        if (current.includes(role.id)) return reply(`<@&${role.id}> is already a **${level}** role.`);
        guildConfig.set(gid, { permissions: { staffLevels: { [level]: [...current, role.id] } } });
        return reply(`✅ <@&${role.id}> is now a **${level}** role.`);
      }
      if (!current.includes(role.id)) return reply(`<@&${role.id}> is not a **${level}** role.`);
      guildConfig.set(gid, { permissions: { staffLevels: { [level]: current.filter((id) => id !== role.id) } } });
      return reply(`✅ Removed <@&${role.id}> from the **${level}** roles.`);
    }

    // status
    const perms = guildConfig.get(gid).permissions;
    const fmtRoles = (ids) => (ids && ids.length ? ids.map((id) => `<@&${id}>`).join(' ') : '*none*');
    const overrides = Object.entries(perms.commandOverrides || {});
    const overrideLines = overrides.length
      ? overrides.map(([cmd, ov]) => {
        const bits = [];
        if (ov.disabled) bits.push('disabled');
        if (ov.allowedRoleIds?.length) bits.push(`allow: ${fmtRoles(ov.allowedRoleIds)}`);
        if (ov.deniedRoleIds?.length) bits.push(`deny: ${fmtRoles(ov.deniedRoleIds)}`);
        return `\`${cmd}\` — ${bits.join(' · ') || 'no active overrides'}`;
      }).join('\n')
      : '*none*';

    const embed = new EmbedBuilder()
      .setTitle('Command permissions')
      .setColor(EMBED_COLOR)
      .addFields(
        { name: 'Staff levels', value: `**mod:** ${fmtRoles(perms.staffLevels?.mod)}\n**admin:** ${fmtRoles(perms.staffLevels?.admin)}` },
        { name: 'Command overrides', value: overrideLines.slice(0, 1024) },
      );
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  } catch (e) {
    logger.error('[perms]', e.message);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: '⚠️ Perms command failed.', flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }
}

module.exports = { data, execute };
