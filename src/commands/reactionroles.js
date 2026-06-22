// src/commands/reactionroles.js — /reactionroles create | add | remove | mode | list
// Mod command: the dispatcher gates this behind ManageGuild / mods role (no bypassModGate),
// so permission is NOT re-checked here. All persistence + rendering goes through
// src/reactionroles/store.js (the hub) — we never reimplement its logic.
'use strict';

const {
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
} = require('discord.js');
const store = require('../reactionroles/store');
const guildConfig = require('../core/guildConfig');
const { parseColor } = require('../embeds/build');
const logger = require('../core/logger');

const DEFAULT_COLOR = 0x5865F2;

const data = new SlashCommandBuilder()
  .setName('reactionroles')
  .setDescription('Self-assignable reaction-role messages')
  // ── create ─────────────────────────────────────────────────────────────────
  .addSubcommand((sub) =>
    sub
      .setName('create')
      .setDescription('Post a new reaction-role message')
      .addChannelOption((o) =>
        o
          .setName('channel')
          .setDescription('Channel to post the reaction-role message in')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(true),
      )
      .addStringOption((o) =>
        o
          .setName('title')
          .setDescription('Title shown on the embed')
          .setRequired(true),
      )
      .addStringOption((o) =>
        o
          .setName('color')
          .setDescription('Hex color like #5865F2 (optional)'),
      ),
  )
  // ── add ──────────────────────────────────────────────────────────────────
  .addSubcommand((sub) =>
    sub
      .setName('add')
      .setDescription('Add a role to a reaction-role message')
      .addStringOption((o) =>
        o
          .setName('message_id')
          .setDescription('ID of the reaction-role message')
          .setRequired(true),
      )
      .addRoleOption((o) =>
        o
          .setName('role')
          .setDescription('Role to grant')
          .setRequired(true),
      )
      .addStringOption((o) =>
        o
          .setName('label')
          .setDescription('Button/menu label (defaults to the role name)'),
      )
      .addStringOption((o) =>
        o
          .setName('emoji')
          .setDescription('Emoji shown next to the role (optional)'),
      ),
  )
  // ── remove ─────────────────────────────────────────────────────────────────
  .addSubcommand((sub) =>
    sub
      .setName('remove')
      .setDescription('Remove a role from a reaction-role message')
      .addStringOption((o) =>
        o
          .setName('message_id')
          .setDescription('ID of the reaction-role message')
          .setRequired(true),
      )
      .addRoleOption((o) =>
        o
          .setName('role')
          .setDescription('Role to remove')
          .setRequired(true),
      ),
  )
  // ── mode ─────────────────────────────────────────────────────────────────
  .addSubcommand((sub) =>
    sub
      .setName('mode')
      .setDescription('Change how a reaction-role message behaves')
      .addStringOption((o) =>
        o
          .setName('message_id')
          .setDescription('ID of the reaction-role message')
          .setRequired(true),
      )
      .addStringOption((o) =>
        o
          .setName('mode')
          .setDescription('normal = pick any · unique = pick one · verify = one-way grant')
          .setRequired(true)
          .addChoices(
            { name: 'normal', value: 'normal' },
            { name: 'unique', value: 'unique' },
            { name: 'verify', value: 'verify' },
          ),
      ),
  )
  // ── list ─────────────────────────────────────────────────────────────────
  .addSubcommand((sub) =>
    sub
      .setName('list')
      .setDescription('List this server\'s reaction-role messages'),
  );

// Re-render a group's live message: fetch the channel + message and edit it.
// Failures are swallowed (warn only) so the config save still counts — e.g. the
// staff deleted the message manually. Returns true on success, false otherwise.
async function rerender(interaction, messageId, group) {
  try {
    const channel =
      interaction.guild.channels.cache.get(group.channelId) ||
      (await interaction.guild.channels.fetch(group.channelId).catch(() => null));
    if (!channel || typeof channel.messages?.fetch !== 'function') {
      logger.warn('[reactionroles:rerender]', `channel ${group.channelId} unavailable for message ${messageId}`);
      return false;
    }
    const msg = await channel.messages.fetch(messageId).catch(() => null);
    if (!msg) {
      logger.warn('[reactionroles:rerender]', `message ${messageId} not found — it may have been deleted`);
      return false;
    }
    await msg.edit({
      embeds: [store.buildEmbed(group)],
      components: store.buildComponents(group),
    });
    return true;
  } catch (e) {
    logger.warn('[reactionroles:rerender]', e.message);
    return false;
  }
}

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  try {
    if (sub === 'create') return await handleCreate(interaction);
    if (sub === 'add') return await handleAdd(interaction);
    if (sub === 'remove') return await handleRemove(interaction);
    if (sub === 'mode') return await handleMode(interaction);
    if (sub === 'list') return await handleList(interaction);
  } catch (e) {
    logger.error('[reactionroles]', e.message);
    if (!interaction.replied && !interaction.deferred) {
      await interaction
        .reply({ content: '⚠️ Reaction-role command failed.', flags: MessageFlags.Ephemeral })
        .catch(() => {});
    } else {
      await interaction
        .followUp({ content: '⚠️ Reaction-role command failed.', flags: MessageFlags.Ephemeral })
        .catch(() => {});
    }
  }
}

// ── /reactionroles create ───────────────────────────────────────────────────
async function handleCreate(interaction) {
  const channel = interaction.options.getChannel('channel');
  const title = interaction.options.getString('title');
  const colorInput = interaction.options.getString('color');

  if (!channel || typeof channel.send !== 'function') {
    return interaction.reply({
      content: '⚠️ I can\'t post in that channel.',
      flags: MessageFlags.Ephemeral,
    });
  }

  let color = DEFAULT_COLOR;
  if (colorInput) {
    const parsed = parseColor(colorInput);
    if (parsed === null) {
      return interaction.reply({
        content: '⚠️ Color must be a hex code like `#5865F2`.',
        flags: MessageFlags.Ephemeral,
      });
    }
    color = parsed;
  }

  const group = {
    channelId: channel.id,
    title,
    color,
    mode: 'normal',
    roles: [],
  };

  const msg = await channel.send({
    embeds: [store.buildEmbed(group)],
    components: store.buildComponents(group),
  });

  store.saveGroup(interaction.guild.id, msg.id, group);

  return interaction.reply({
    content:
      `✅ Reaction-role message posted in <#${channel.id}>.\n` +
      `Message ID: \`${msg.id}\`\n` +
      `Add roles with \`/reactionroles add message_id:${msg.id} role:@Role\`.`,
    flags: MessageFlags.Ephemeral,
  });
}

// ── /reactionroles add ───────────────────────────────────────────────────────
async function handleAdd(interaction) {
  const guild = interaction.guild;
  const messageId = interaction.options.getString('message_id');
  const role = interaction.options.getRole('role');
  const label = interaction.options.getString('label');
  const emoji = interaction.options.getString('emoji');

  const group = store.getGroup(guild.id, messageId);
  if (!group) {
    return interaction.reply({
      content: '⚠️ No reaction-role message with that id — create one first.',
      flags: MessageFlags.Ephemeral,
    });
  }

  // @everyone / managed roles can't be self-assigned.
  if (role.id === guild.id || role.managed) {
    return interaction.reply({
      content: '⚠️ That role can\'t be self-assigned (it\'s either @everyone or managed by an integration).',
      flags: MessageFlags.Ephemeral,
    });
  }

  // The bot must outrank the role to grant/remove it.
  if (role.position >= guild.members.me.roles.highest.position) {
    return interaction.reply({
      content: '⚠️ My top role must be above that role.',
      flags: MessageFlags.Ephemeral,
    });
  }

  if (group.roles.some((r) => r.roleId === role.id)) {
    return interaction.reply({
      content: '⚠️ Already added.',
      flags: MessageFlags.Ephemeral,
    });
  }

  if (group.roles.length >= store.MAX_ROLES) {
    return interaction.reply({
      content: `⚠️ Max ${store.MAX_ROLES} roles.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  group.roles.push({ roleId: role.id, label: label || role.name, emoji: emoji || null });
  store.saveGroup(guild.id, messageId, group);

  const rendered = await rerender(interaction, messageId, group);

  return interaction.reply({
    content:
      `✅ Added <@&${role.id}> to the reaction-role message.` +
      (rendered ? '' : '\n⚠️ Saved, but I couldn\'t update the live message (it may have been deleted).'),
    flags: MessageFlags.Ephemeral,
  });
}

// ── /reactionroles remove ────────────────────────────────────────────────────
async function handleRemove(interaction) {
  const guild = interaction.guild;
  const messageId = interaction.options.getString('message_id');
  const role = interaction.options.getRole('role');

  const group = store.getGroup(guild.id, messageId);
  if (!group) {
    return interaction.reply({
      content: '⚠️ No reaction-role message with that id — create one first.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const before = group.roles.length;
  group.roles = group.roles.filter((r) => r.roleId !== role.id);

  if (group.roles.length === before) {
    return interaction.reply({
      content: '⚠️ That role isn\'t on this reaction-role message.',
      flags: MessageFlags.Ephemeral,
    });
  }

  store.saveGroup(guild.id, messageId, group);

  const rendered = await rerender(interaction, messageId, group);

  return interaction.reply({
    content:
      `✅ Removed <@&${role.id}> from the reaction-role message.` +
      (rendered ? '' : '\n⚠️ Saved, but I couldn\'t update the live message (it may have been deleted).'),
    flags: MessageFlags.Ephemeral,
  });
}

// ── /reactionroles mode ──────────────────────────────────────────────────────
async function handleMode(interaction) {
  const guild = interaction.guild;
  const messageId = interaction.options.getString('message_id');
  const mode = interaction.options.getString('mode');

  const group = store.getGroup(guild.id, messageId);
  if (!group) {
    return interaction.reply({
      content: '⚠️ No reaction-role message with that id — create one first.',
      flags: MessageFlags.Ephemeral,
    });
  }

  group.mode = mode;
  store.saveGroup(guild.id, messageId, group);

  const rendered = await rerender(interaction, messageId, group);

  return interaction.reply({
    content:
      `✅ Mode set to \`${mode}\`.` +
      (rendered ? '' : '\n⚠️ Saved, but I couldn\'t update the live message (it may have been deleted).'),
    flags: MessageFlags.Ephemeral,
  });
}

// ── /reactionroles list ──────────────────────────────────────────────────────
async function handleList(interaction) {
  const guild = interaction.guild;
  const groups = guildConfig.get(guild.id).reactionRoles || {};
  const entries = Object.entries(groups);

  const embed = new EmbedBuilder()
    .setTitle('Reaction-role messages')
    .setColor(DEFAULT_COLOR);

  if (entries.length === 0) {
    embed.setDescription('*None yet — create one with `/reactionroles create`.*');
  } else {
    const lines = entries.map(([messageId, group]) => {
      const count = Array.isArray(group.roles) ? group.roles.length : 0;
      const channel = group.channelId ? `<#${group.channelId}>` : '*unknown channel*';
      const mode = group.mode || 'normal';
      return `\`${messageId}\` — ${channel} · mode: \`${mode}\` · ${count} role${count === 1 ? '' : 's'}`;
    });
    embed.setDescription(lines.join('\n').slice(0, 4096));
  }

  return interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = { data, execute };
