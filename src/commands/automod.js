// src/commands/automod.js — /automod toggle | set | addregex | removeregex | whitelist | ignore | status
// Mod command: the dispatcher gates this behind ManageGuild / mods role (no bypassModGate),
// so permission is NOT re-checked here. The per-guild automod settings live in guildConfig
// (structured under .automod); regex validation reuses compilePattern from the checks hub —
// we never reimplement detection here, this file only edits configuration.
'use strict';

const {
  SlashCommandBuilder,
  MessageFlags,
  EmbedBuilder,
} = require('discord.js');
const guildConfig = require('../core/guildConfig');
const { compilePattern } = require('../protection/automodChecks');
const logger = require('../core/logger');

const EMBED_COLOR = 0x5865F2;

// The per-guild content/behaviour modules an admin can toggle on/off.
const MODULES = ['caps', 'mentions', 'emoji', 'duplicate', 'flood', 'regex', 'nsfwLinks'];
const moduleChoices = MODULES.map((m) => ({ name: m, value: m }));

// Numeric thresholds that `/automod set` may adjust, per module. Modules absent here
// (regex, nsfwLinks) have no settable scalar thresholds — only enable/disable.
const SETTABLE = {
  caps: ['minLength', 'percent'],
  mentions: ['max'],
  emoji: ['max'],
  duplicate: ['windowSec'],
  flood: ['max', 'windowSec'],
};

const data = new SlashCommandBuilder()
  .setName('automod')
  .setDescription('Configure the per-guild automod (caps/mentions/emoji/duplicate/flood/regex/NSFW links)')
  // ── toggle ──────────────────────────────────────────────────────────────────
  .addSubcommand((sub) =>
    sub
      .setName('toggle')
      .setDescription('Enable or disable an automod module')
      .addStringOption((o) =>
        o
          .setName('module')
          .setDescription('Which module to toggle')
          .setRequired(true)
          .addChoices(...moduleChoices),
      )
      .addStringOption((o) =>
        o
          .setName('state')
          .setDescription('Turn this module on or off')
          .setRequired(true)
          .addChoices(
            { name: 'on', value: 'on' },
            { name: 'off', value: 'off' },
          ),
      ),
  )
  // ── set ─────────────────────────────────────────────────────────────────────
  .addSubcommand((sub) =>
    sub
      .setName('set')
      .setDescription('Set a numeric threshold for a module')
      .addStringOption((o) =>
        o
          .setName('module')
          .setDescription('Which module to configure')
          .setRequired(true)
          .addChoices(...moduleChoices),
      )
      .addStringOption((o) =>
        o
          .setName('key')
          .setDescription('caps: minLength/percent · mentions/emoji: max · duplicate: windowSec · flood: max/windowSec')
          .setRequired(true),
      )
      .addIntegerOption((o) =>
        o
          .setName('value')
          .setDescription('New value (must be 0 or greater)')
          .setRequired(true),
      ),
  )
  // ── addregex ────────────────────────────────────────────────────────────────
  .addSubcommand((sub) =>
    sub
      .setName('addregex')
      .setDescription('Add a regex pattern to the regex filter')
      .addStringOption((o) =>
        o
          .setName('pattern')
          .setDescription('Regex source (no surrounding slashes)')
          .setRequired(true),
      )
      .addStringOption((o) =>
        o
          .setName('flags')
          .setDescription("Regex flags (default 'i'; 'i' is always enforced)")
          .setRequired(false),
      ),
  )
  // ── removeregex ───────────────────────────────────────────────────────────────
  .addSubcommand((sub) =>
    sub
      .setName('removeregex')
      .setDescription('Remove a regex pattern by its number (see /automod status)')
      .addIntegerOption((o) =>
        o
          .setName('index')
          .setDescription('1-based pattern number to remove')
          .setRequired(true),
      ),
  )
  // ── whitelist ─────────────────────────────────────────────────────────────────
  .addSubcommand((sub) =>
    sub
      .setName('whitelist')
      .setDescription('Add or remove a role exempt from automod')
      .addStringOption((o) =>
        o
          .setName('action')
          .setDescription('Add or remove the role')
          .setRequired(true)
          .addChoices(
            { name: 'add', value: 'add' },
            { name: 'remove', value: 'remove' },
          ),
      )
      .addRoleOption((o) =>
        o.setName('role').setDescription('Role to whitelist').setRequired(true),
      ),
  )
  // ── ignore ──────────────────────────────────────────────────────────────────
  .addSubcommand((sub) =>
    sub
      .setName('ignore')
      .setDescription('Add or remove a channel automod ignores')
      .addStringOption((o) =>
        o
          .setName('action')
          .setDescription('Add or remove the channel')
          .setRequired(true)
          .addChoices(
            { name: 'add', value: 'add' },
            { name: 'remove', value: 'remove' },
          ),
      )
      .addChannelOption((o) =>
        o.setName('channel').setDescription('Channel to ignore').setRequired(true),
      ),
  )
  // ── status ──────────────────────────────────────────────────────────────────
  .addSubcommand((sub) =>
    sub
      .setName('status')
      .setDescription('Show the current automod configuration'),
  );

// Concise per-module threshold summary for the status embed.
function thresholdSummary(module, cfg) {
  const m = cfg[module] || {};
  switch (module) {
    case 'caps':
      return `minLength ${m.minLength}, percent ${m.percent}%`;
    case 'mentions':
      return `max ${m.max}`;
    case 'emoji':
      return `max ${m.max}`;
    case 'duplicate':
      return `windowSec ${m.windowSec}`;
    case 'flood':
      return `max ${m.max} / ${m.windowSec}s`;
    case 'regex':
      return `${(m.patterns || []).length} pattern(s)`;
    case 'nsfwLinks':
      return 'blocklist-based';
    default:
      return '';
  }
}

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const gid = interaction.guildId;

  try {
    if (sub === 'toggle') {
      const module = interaction.options.getString('module');
      const state = interaction.options.getString('state');
      guildConfig.set(gid, { automod: { [module]: { enabled: state === 'on' } } });
      return interaction.reply({
        content: `✅ Automod **${module}** is now **${state === 'on' ? 'on' : 'off'}**.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'set') {
      const module = interaction.options.getString('module');
      const key = interaction.options.getString('key');
      const value = interaction.options.getInteger('value');

      const validKeys = SETTABLE[module];
      if (!validKeys?.includes(key)) {
        const valid = validKeys?.length
          ? validKeys.map((k) => `\`${k}\``).join(', ')
          : '*(this module has no settable values)*';
        return interaction.reply({
          content: `⚠️ Invalid key for **${module}**. Valid keys: ${valid}.`,
          flags: MessageFlags.Ephemeral,
        });
      }
      if (value < 0) {
        return interaction.reply({
          content: '⚠️ Value must be 0 or greater.',
          flags: MessageFlags.Ephemeral,
        });
      }

      guildConfig.set(gid, { automod: { [module]: { [key]: value } } });
      return interaction.reply({
        content: `✅ Set **${module}.${key}** to **${value}**.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'addregex') {
      const pattern = interaction.options.getString('pattern');
      const flags = interaction.options.getString('flags') || 'i';

      const re = compilePattern({ source: pattern, flags });
      if (!re) {
        return interaction.reply({
          content: '⚠️ Invalid or too-long regex.',
          flags: MessageFlags.Ephemeral,
        });
      }

      // patterns is an array → deepMerge replaces it wholesale, so read-modify-write the full array.
      const current = guildConfig.get(gid).automod.regex.patterns || [];
      const next = [...current, { source: pattern, flags }];
      guildConfig.set(gid, { automod: { regex: { patterns: next } } });
      return interaction.reply({
        content: `✅ Added regex pattern (${next.length} total). Enable it with \`/automod toggle module:regex state:on\` if it isn't already.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'removeregex') {
      const index = interaction.options.getInteger('index');
      const current = guildConfig.get(gid).automod.regex.patterns || [];

      if (index < 1 || index > current.length) {
        return interaction.reply({
          content: current.length
            ? `⚠️ Invalid number. Pick between 1 and ${current.length} (see \`/automod status\`).`
            : '⚠️ There are no regex patterns to remove.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const next = [...current];
      const [removed] = next.splice(index - 1, 1);
      guildConfig.set(gid, { automod: { regex: { patterns: next } } });
      const removedSrc = typeof removed === 'string' ? removed : removed?.source;
      return interaction.reply({
        content: `✅ Removed pattern #${index} (\`/${removedSrc}/\`). ${next.length} left.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'whitelist') {
      const action = interaction.options.getString('action');
      const role = interaction.options.getRole('role');
      const current = guildConfig.get(gid).automod.whitelistRoleIds || [];

      if (action === 'add') {
        if (current.includes(role.id)) {
          return interaction.reply({
            content: `<@&${role.id}> is already whitelisted.`,
            flags: MessageFlags.Ephemeral,
          });
        }
        const next = [...current, role.id];
        guildConfig.set(gid, { automod: { whitelistRoleIds: next } });
        return interaction.reply({
          content: `✅ Whitelisted <@&${role.id}> (${next.length} total).`,
          flags: MessageFlags.Ephemeral,
        });
      }

      // action === 'remove'
      if (!current.includes(role.id)) {
        return interaction.reply({
          content: `<@&${role.id}> is not whitelisted.`,
          flags: MessageFlags.Ephemeral,
        });
      }
      const next = current.filter((id) => id !== role.id);
      guildConfig.set(gid, { automod: { whitelistRoleIds: next } });
      return interaction.reply({
        content: `✅ Removed <@&${role.id}> from the whitelist (${next.length} left).`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'ignore') {
      const action = interaction.options.getString('action');
      const channel = interaction.options.getChannel('channel');
      const current = guildConfig.get(gid).automod.ignoredChannelIds || [];

      if (action === 'add') {
        if (current.includes(channel.id)) {
          return interaction.reply({
            content: `<#${channel.id}> is already ignored.`,
            flags: MessageFlags.Ephemeral,
          });
        }
        const next = [...current, channel.id];
        guildConfig.set(gid, { automod: { ignoredChannelIds: next } });
        return interaction.reply({
          content: `✅ Automod now ignores <#${channel.id}> (${next.length} total).`,
          flags: MessageFlags.Ephemeral,
        });
      }

      // action === 'remove'
      if (!current.includes(channel.id)) {
        return interaction.reply({
          content: `<#${channel.id}> is not in the ignore list.`,
          flags: MessageFlags.Ephemeral,
        });
      }
      const next = current.filter((id) => id !== channel.id);
      guildConfig.set(gid, { automod: { ignoredChannelIds: next } });
      return interaction.reply({
        content: `✅ Automod no longer ignores <#${channel.id}> (${next.length} left).`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'status') {
      const am = guildConfig.get(gid).automod;

      const moduleLines = MODULES.map((m) => {
        const on = am[m]?.enabled ? '🟢 on ' : '🔴 off';
        return `${on} • **${m}** — ${thresholdSummary(m, am)}`;
      });

      const patterns = am.regex?.patterns || [];
      const patternLines = patterns.length
        ? patterns
            .map((p, i) => {
              const src = typeof p === 'string' ? p : p.source;
              const flags = typeof p === 'string' ? 'i' : (p.flags || 'i');
              return `${i + 1}. \`/${src}/${flags}\``;
            })
            .join('\n')
        : '*none*';

      const roles = (am.whitelistRoleIds || []).map((id) => `<@&${id}>`).join(' ') || '*none*';
      const channels = (am.ignoredChannelIds || []).map((id) => `<#${id}>`).join(' ') || '*none*';

      const embed = new EmbedBuilder()
        .setTitle('Automod configuration')
        .setColor(EMBED_COLOR)
        .setDescription(`Timeout steps: ${(am.timeoutSteps || []).join(' → ') || '*none*'} · strike decay: ${am.strikeDecayDays}d`)
        .addFields(
          { name: 'Modules', value: moduleLines.join('\n').slice(0, 1024) || '*none*' },
          { name: 'Regex patterns', value: patternLines.slice(0, 1024) },
          { name: 'Whitelisted roles', value: roles.slice(0, 1024) },
          { name: 'Ignored channels', value: channels.slice(0, 1024) },
        );

      return interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
      });
    }
  } catch (err) {
    logger.error('[automod:command]', err.message);
    if (!interaction.replied && !interaction.deferred) {
      await interaction
        .reply({ content: '⚠️ Automod command failed.', flags: MessageFlags.Ephemeral })
        .catch(() => {});
    }
  }
}

module.exports = { data, execute };
