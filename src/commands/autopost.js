// src/commands/autopost.js — /autopost create | list | remove (staff only)
// Schedules durable recurring/one-off posts via the 'autopost' scheduler handler
// registered in src/autopost/index.js.
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
} = require('discord.js');
const { isStaff } = require('../core/perms');
const { checkSendPerms } = require('../embeds/build');
const scheduler = require('../core/scheduler');
const logger = require('../core/logger');
const autopost = require('../autopost');

const EVERY_LABELS = { once: 'Once', hourly: 'Hourly', daily: 'Daily', weekly: 'Weekly' };

const data = new SlashCommandBuilder()
  .setName('autopost')
  .setDescription('Scheduled / recurring auto-posts (staff only)')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  // ── create ────────────────────────────────────────────────────────────────
  .addSubcommand((sub) =>
    sub
      .setName('create')
      .setDescription('Schedule a new auto-post')
      .addChannelOption((o) =>
        o
          .setName('channel')
          .setDescription('Channel to post in')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(true),
      )
      .addStringOption((o) =>
        o
          .setName('message')
          .setDescription('The text (or embed description if a title is set)')
          .setRequired(true),
      )
      .addStringOption((o) =>
        o.setName('title').setDescription('If set, posts as an embed with this title'),
      )
      .addStringOption((o) =>
        o
          .setName('every')
          .setDescription('How often to repeat (default: once)')
          .addChoices(
            { name: 'Once',   value: 'once'   },
            { name: 'Hourly', value: 'hourly' },
            { name: 'Daily',  value: 'daily'  },
            { name: 'Weekly', value: 'weekly' },
          ),
      )
      .addStringOption((o) =>
        o.setName('first_delay').setDescription("Delay before first post, e.g. '10m', '1h', '2d' (default: now)"),
      ),
  )
  // ── list ──────────────────────────────────────────────────────────────────
  .addSubcommand((sub) =>
    sub.setName('list').setDescription('List this server\'s auto-posts'),
  )
  // ── remove ────────────────────────────────────────────────────────────────
  .addSubcommand((sub) =>
    sub
      .setName('remove')
      .setDescription('Cancel and delete an auto-post')
      .addStringOption((o) =>
        o.setName('id').setDescription('The auto-post id (from /autopost list)').setRequired(true),
      ),
  );

async function execute(interaction) {
  if (!isStaff(interaction.member, interaction.guildId)) {
    return interaction.reply({ content: '⛔ Staff only.', flags: MessageFlags.Ephemeral });
  }

  const sub = interaction.options.getSubcommand();
  try {
    if (sub === 'create') return await handleCreate(interaction);
    if (sub === 'list')   return await handleList(interaction);
    if (sub === 'remove') return await handleRemove(interaction);
  } catch (err) {
    logger.error('[autopost:command]', err.message);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: '⚠️ Autopost command failed.', flags: MessageFlags.Ephemeral }).catch(() => {});
    } else {
      await interaction.followUp({ content: '⚠️ Autopost command failed.', flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }
}

// ── /autopost create ────────────────────────────────────────────────────────
async function handleCreate(interaction) {
  const opts = interaction.options;
  const channel = opts.getChannel('channel');
  const message = opts.getString('message');
  const title = opts.getString('title') ?? null;
  const every = opts.getString('every') ?? 'once';
  const firstDelay = opts.getString('first_delay') ?? '0';

  // Permission preflight — title => embed, so always require Embed Links to be safe.
  const missing = checkSendPerms(channel, interaction.guild.members.me, false);
  if (missing.length > 0) {
    return interaction.reply({
      content: `⛔ I'm missing permissions in <#${channel.id}>: **${missing.join(', ')}**`,
      flags: MessageFlags.Ephemeral,
    });
  }

  const nextAt = Date.now() + autopost.parseDelay(firstDelay);
  const id = `ap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const def = {
    id,
    guildId: interaction.guildId,
    channelId: channel.id,
    title,
    message,
    every,
    nextAt,
    jobId: null,
  };

  await autopost.saveDef(def);
  const jobId = scheduler.schedule('autopost', nextAt, { id });
  await autopost.patchDef(id, { jobId });

  const unix = Math.floor(nextAt / 1000);
  return interaction.reply({
    content:
      `✅ Auto-post created.\n` +
      `• **id:** \`${id}\`\n` +
      `• **channel:** <#${channel.id}>\n` +
      `• **repeat:** ${EVERY_LABELS[every] || every}\n` +
      `• **first post:** <t:${unix}:R> (<t:${unix}:f>)`,
    flags: MessageFlags.Ephemeral,
  });
}

// ── /autopost list ──────────────────────────────────────────────────────────
async function handleList(interaction) {
  const defs = autopost.listForGuild(interaction.guildId);
  if (defs.length === 0) {
    return interaction.reply({ content: 'No auto-posts configured for this server.', flags: MessageFlags.Ephemeral });
  }

  defs.sort((a, b) => a.nextAt - b.nextAt);
  const lines = defs.map((d) => {
    const unix = Math.floor(d.nextAt / 1000);
    return `• \`${d.id}\` — <#${d.channelId}> — **${EVERY_LABELS[d.every] || d.every}** — next <t:${unix}:R>`;
  });

  return interaction.reply({
    content: `**Auto-posts (${defs.length}):**\n${lines.join('\n')}`,
    flags: MessageFlags.Ephemeral,
  });
}

// ── /autopost remove ──────────────────────────────────────────────────────────
async function handleRemove(interaction) {
  const id = interaction.options.getString('id');
  const def = autopost.getDef(id);
  if (!def || def.guildId !== interaction.guildId) {
    return interaction.reply({ content: `⚠️ No auto-post with id \`${id}\` in this server.`, flags: MessageFlags.Ephemeral });
  }

  if (def.jobId) {
    try { scheduler.cancel(def.jobId); } catch (e) { logger.error('[autopost:remove] cancel', e.message); }
  }
  await autopost.deleteDef(id);

  return interaction.reply({ content: `🗑️ Removed auto-post \`${id}\`.`, flags: MessageFlags.Ephemeral });
}

module.exports = { data, execute, bypassModGate: true };
