// src/commands/welcome.js — /welcome configuration (welcome/goodbye + auto-role).
// bypassModGate = true: dispatcher skips the global isMod gate; we self-check isStaff here.
const {
  SlashCommandBuilder,
  ChannelType,
  MessageFlags,
} = require('discord.js');
const guildConfig = require('../core/guildConfig');
const { isStaff } = require('../core/perms');
const { substitute } = require('../welcome/events');
const logger = require('../core/logger');

const data = new SlashCommandBuilder()
  .setName('welcome')
  .setDescription('Welcome / goodbye messages and auto-role')
  // ── set-channel ────────────────────────────────────────────────────────────
  .addSubcommand((sub) =>
    sub
      .setName('set-channel')
      .setDescription('Set the channel where welcome messages are posted')
      .addChannelOption((o) =>
        o
          .setName('channel')
          .setDescription('Welcome channel')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true),
      ),
  )
  // ── set-message ──────────────────────────────────────────────────────────
  .addSubcommand((sub) =>
    sub
      .setName('set-message')
      .setDescription('Set the welcome message text')
      .addStringOption((o) =>
        o
          .setName('text')
          .setDescription('Tokens: {user} {username} {server} {count}')
          .setRequired(true),
      ),
  )
  // ── set-leave-channel ──────────────────────────────────────────────────────
  .addSubcommand((sub) =>
    sub
      .setName('set-leave-channel')
      .setDescription('Set the channel where goodbye messages are posted')
      .addChannelOption((o) =>
        o
          .setName('channel')
          .setDescription('Goodbye channel')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true),
      ),
  )
  // ── set-leave-message ──────────────────────────────────────────────────────
  .addSubcommand((sub) =>
    sub
      .setName('set-leave-message')
      .setDescription('Set the goodbye message text')
      .addStringOption((o) =>
        o
          .setName('text')
          .setDescription('Tokens: {username} {server} {count}')
          .setRequired(true),
      ),
  )
  // ── toggle ──────────────────────────────────────────────────────────────────
  .addSubcommand((sub) =>
    sub
      .setName('toggle')
      .setDescription('Enable or disable welcome/goodbye messages')
      .addBooleanOption((o) =>
        o.setName('enabled').setDescription('Enabled?').setRequired(true),
      ),
  )
  // ── autorole-add ────────────────────────────────────────────────────────────
  .addSubcommand((sub) =>
    sub
      .setName('autorole-add')
      .setDescription('Add a role to auto-assign on join')
      .addRoleOption((o) =>
        o.setName('role').setDescription('Role to add').setRequired(true),
      ),
  )
  // ── autorole-remove ──────────────────────────────────────────────────────────
  .addSubcommand((sub) =>
    sub
      .setName('autorole-remove')
      .setDescription('Remove a role from the auto-assign list')
      .addRoleOption((o) =>
        o.setName('role').setDescription('Role to remove').setRequired(true),
      ),
  )
  // ── test ──────────────────────────────────────────────────────────────────────
  .addSubcommand((sub) =>
    sub
      .setName('test')
      .setDescription('Preview the welcome message rendered for you'),
  );

async function execute(interaction) {
  if (!isStaff(interaction.member, interaction.guildId)) {
    return interaction.reply({ content: '⛔ Staff only.', flags: MessageFlags.Ephemeral });
  }

  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId;

  try {
    if (sub === 'set-channel') {
      const channel = interaction.options.getChannel('channel');
      guildConfig.set(guildId, { welcome: { channelId: channel.id } });
      return interaction.reply({
        content: `✅ Welcome channel set to <#${channel.id}>.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'set-message') {
      const text = interaction.options.getString('text');
      guildConfig.set(guildId, { welcome: { text } });
      return interaction.reply({
        content: `✅ Welcome message set:\n>>> ${text}`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'set-leave-channel') {
      const channel = interaction.options.getChannel('channel');
      guildConfig.set(guildId, { welcome: { leaveChannelId: channel.id } });
      return interaction.reply({
        content: `✅ Goodbye channel set to <#${channel.id}>.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'set-leave-message') {
      const text = interaction.options.getString('text');
      guildConfig.set(guildId, { welcome: { leaveText: text } });
      return interaction.reply({
        content: `✅ Goodbye message set:\n>>> ${text}`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'toggle') {
      const enabled = interaction.options.getBoolean('enabled');
      guildConfig.set(guildId, { welcome: { enabled } });
      return interaction.reply({
        content: enabled
          ? '✅ Welcome/goodbye messages **enabled**.'
          : '✅ Welcome/goodbye messages **disabled**.',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'autorole-add') {
      const role = interaction.options.getRole('role');
      const current = guildConfig.get(guildId).welcome.autoRoleIds || [];
      if (current.includes(role.id)) {
        return interaction.reply({
          content: `<@&${role.id}> is already in the auto-role list.`,
          flags: MessageFlags.Ephemeral,
        });
      }
      const next = [...current, role.id];
      // autoRoleIds is an array → deepMerge replaces it wholesale, so set the whole array.
      guildConfig.set(guildId, { welcome: { autoRoleIds: next } });
      return interaction.reply({
        content: `✅ Added <@&${role.id}> to auto-roles (${next.length} total).`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'autorole-remove') {
      const role = interaction.options.getRole('role');
      const current = guildConfig.get(guildId).welcome.autoRoleIds || [];
      if (!current.includes(role.id)) {
        return interaction.reply({
          content: `<@&${role.id}> is not in the auto-role list.`,
          flags: MessageFlags.Ephemeral,
        });
      }
      const next = current.filter((id) => id !== role.id);
      guildConfig.set(guildId, { welcome: { autoRoleIds: next } });
      return interaction.reply({
        content: `✅ Removed <@&${role.id}> from auto-roles (${next.length} left).`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'test') {
      const cfg = guildConfig.get(guildId).welcome;
      const rendered = substitute(cfg.text, {
        member: interaction.member,
        guild: interaction.guild,
      });

      // If a welcome channel is configured, post there; otherwise just preview.
      if (cfg.channelId) {
        const ch =
          interaction.guild.channels.cache.get(cfg.channelId) ||
          (await interaction.guild.channels.fetch(cfg.channelId).catch(() => null));
        if (ch && typeof ch.send === 'function') {
          try {
            await ch.send({ content: rendered, allowedMentions: { parse: ['users'] } });
            return interaction.reply({
              content: `✅ Test welcome posted to <#${cfg.channelId}>.`,
              flags: MessageFlags.Ephemeral,
            });
          } catch (e) {
            logger.error('[welcome:test]', e.message);
            return interaction.reply({
              content: `⚠️ Couldn't post to <#${cfg.channelId}>. Preview:\n${rendered}`,
              flags: MessageFlags.Ephemeral,
            });
          }
        }
      }

      return interaction.reply({
        content: `Preview (no welcome channel set):\n${rendered}`,
        flags: MessageFlags.Ephemeral,
      });
    }
  } catch (err) {
    logger.error('[welcome:command]', err.message);
    if (!interaction.replied && !interaction.deferred) {
      await interaction
        .reply({ content: '⚠️ Welcome command failed.', flags: MessageFlags.Ephemeral })
        .catch(() => {});
    }
  }
}

module.exports = { data, execute, bypassModGate: true };
