// src/commands/logging.js — /logging channel | toggle | override | status
// Mod command: the dispatcher gates this behind ManageGuild / mods role (no bypassModGate),
// so permission is NOT re-checked here. The event catalog + gating helpers live in
// src/logging/config.js (the hub) — we require + reuse it, never reimplement it.
'use strict';

const {
  SlashCommandBuilder,
  ChannelType,
  MessageFlags,
  EmbedBuilder,
} = require('discord.js');
const guildConfig = require('../core/guildConfig');
const { EVENTS, isEnabled } = require('../logging/config');
const logger = require('../core/logger');

const EMBED_COLOR = 0x5865F2;

// One choice per catalog event (~20, well under Discord's 25-choice cap).
const eventChoices = EVENTS.map((e) => ({ name: e.label, value: e.key }));

// key -> label lookup for friendly status output.
const LABELS = Object.fromEntries(EVENTS.map((e) => [e.key, e.label]));

const data = new SlashCommandBuilder()
  .setName('logging')
  .setDescription('Configure server audit logging (message/channel/role/member events)')
  // ── channel ─────────────────────────────────────────────────────────────────
  .addSubcommand((sub) =>
    sub
      .setName('channel')
      .setDescription('Set the master log channel — turns logging on for all events')
      .addChannelOption((o) =>
        o
          .setName('channel')
          .setDescription('Channel where logs are posted')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(true),
      ),
  )
  // ── toggle ──────────────────────────────────────────────────────────────────
  .addSubcommand((sub) =>
    sub
      .setName('toggle')
      .setDescription('Enable or disable logging for a single event')
      .addStringOption((o) =>
        o
          .setName('event')
          .setDescription('Which event to toggle')
          .setRequired(true)
          .addChoices(...eventChoices),
      )
      .addStringOption((o) =>
        o
          .setName('state')
          .setDescription('Turn this event on or off')
          .setRequired(true)
          .addChoices(
            { name: 'on', value: 'on' },
            { name: 'off', value: 'off' },
          ),
      ),
  )
  // ── override ──────────────────────────────────────────────────────────────────
  .addSubcommand((sub) =>
    sub
      .setName('override')
      .setDescription('Send one event to a different channel than the master log')
      .addStringOption((o) =>
        o
          .setName('event')
          .setDescription('Which event to redirect')
          .setRequired(true)
          .addChoices(...eventChoices),
      )
      .addChannelOption((o) =>
        o
          .setName('channel')
          .setDescription('Channel this event should post to')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(true),
      ),
  )
  // ── status ──────────────────────────────────────────────────────────────────
  .addSubcommand((sub) =>
    sub
      .setName('status')
      .setDescription('Show the current logging configuration'),
  );

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const gid = interaction.guildId;

  try {
    if (sub === 'channel') {
      const channel = interaction.options.getChannel('channel');
      guildConfig.set(gid, { logging: { channelId: channel.id } });
      return interaction.reply({
        content:
          `✅ Logs will post to <#${channel.id}>. All events are on by default — ` +
          'disable any with `/logging toggle`.',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'toggle') {
      const event = interaction.options.getString('event');
      const state = interaction.options.getString('state');
      const on = state === 'on';
      guildConfig.set(gid, { logging: { events: { [event]: on } } });
      return interaction.reply({
        content: `✅ **${LABELS[event] || event}** logging is now **${on ? 'on' : 'off'}**.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'override') {
      const event = interaction.options.getString('event');
      const channel = interaction.options.getChannel('channel');
      guildConfig.set(gid, { logging: { channelOverrides: { [event]: channel.id } } });
      return interaction.reply({
        content: `✅ **${LABELS[event] || event}** events will now post to <#${channel.id}>.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'status') {
      const lg = guildConfig.get(gid).logging;

      const events = lg.events || {};
      const overrides = lg.channelOverrides || {};

      const disabled = EVENTS
        .filter((e) => events[e.key] === false)
        .map((e) => `• ${e.label}`);

      const overrideLines = Object.entries(overrides)
        .filter(([, channelId]) => channelId)
        .map(([key, channelId]) => `• ${LABELS[key] || key} → <#${channelId}>`);

      const embed = new EmbedBuilder()
        .setTitle('Logging configuration')
        .setColor(EMBED_COLOR)
        .addFields(
          {
            name: 'Master channel',
            value: lg.channelId ? `<#${lg.channelId}>` : '*not set — logging is off*',
          },
          {
            name: 'Disabled events',
            value: disabled.length ? disabled.join('\n').slice(0, 1024) : '*none — all events on*',
          },
          {
            name: 'Channel overrides',
            value: overrideLines.length ? overrideLines.join('\n').slice(0, 1024) : '*none*',
          },
        );

      return interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
      });
    }
  } catch (err) {
    logger.error('[logging:command]', err.message);
    if (!interaction.replied && !interaction.deferred) {
      await interaction
        .reply({ content: '⚠️ Logging command failed.', flags: MessageFlags.Ephemeral })
        .catch(() => {});
    }
  }
}

module.exports = { data, execute };
