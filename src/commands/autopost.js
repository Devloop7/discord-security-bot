// src/commands/autopost.js — /autopost (staff only)
// Scheduled / recurring auto-posts v2. Subcommands:
//   create | design | list | edit | pause | resume | test | remove | timezone
// New-style defs carry { payload, schedule }; legacy { title, message, every } defs
// stay listable/removable but must be recreated to change their schedule.
'use strict';

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
} = require('discord.js');

const { isStaff } = require('../core/perms');
const scheduler = require('../core/scheduler');
const logger = require('../core/logger');
const autopost = require('../autopost');
const {
  validateSchedule,
  nextRunAt,
  onceEpochFromDate,
  parseTime,
  isValidTz,
} = require('../autopost/schedule');
const designs = require('../autopost/designs');
const guildConfig = require('../core/guildConfig');
const { checkSendPerms } = require('../embeds/build');
const { initDraft, renderPanel } = require('../embeds/interactions');

const DEFAULT_TZ = 'Asia/Jerusalem';
const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const EVERY_LABELS = { once: 'Once', hourly: 'Hourly', daily: 'Daily', weekly: 'Weekly' };

// Parse a weekly "days" string: digits (0=Sun..6=Sat) or 3-letter names (sun..sat),
// comma/space separated, case-insensitive. Returns sorted unique [0-6] or null on
// any unrecognized token.
function parseDays(raw) {
  if (!raw) return null;
  const tokens = String(raw).split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  if (!tokens.length) return null;
  const out = new Set();
  for (const tok of tokens) {
    if (/^[0-6]$/.test(tok)) {
      out.add(Number(tok));
      continue;
    }
    const idx = DAY_NAMES.indexOf(tok.slice(0, 3).toLowerCase());
    if (idx === -1) return null;
    out.add(idx);
  }
  return [...out].sort((a, b) => a - b);
}

// Human-readable one-line summary of a schedule (new or legacy def).
function scheduleSummary(def) {
  const s = def.schedule;
  if (!s) {
    // Legacy def.
    return `${EVERY_LABELS[def.every] || def.every || 'once'}${def.title ? ' (embed)' : ''}`;
  }
  const tz = s.tz || DEFAULT_TZ;
  if (s.type === 'once') return `Once @ <t:${Math.floor((s.at || 0) / 1000)}:f>`;
  if (s.type === 'daily') return `Daily at ${s.time} (${tz})`;
  if (s.type === 'weekly') {
    const days = (s.days || []).map((d) => DAY_LABELS[d]).join(', ');
    return `Weekly on ${days} at ${s.time} (${tz})`;
  }
  if (s.type === 'monthly') return `Monthly on day ${s.dom} at ${s.time} (${tz})`;
  if (s.type === 'interval') return `Every ${s.everyMinutes} min`;
  return s.type;
}

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
          .setName('type')
          .setDescription('How the post recurs')
          .setRequired(true)
          .addChoices(
            { name: 'Once', value: 'once' },
            { name: 'Daily', value: 'daily' },
            { name: 'Weekly', value: 'weekly' },
            { name: 'Monthly', value: 'monthly' },
            { name: 'Interval', value: 'interval' },
          ),
      )
      .addStringOption((o) => o.setName('time').setDescription("Time 'HH:MM' (daily/weekly/monthly/once)"))
      .addStringOption((o) => o.setName('date').setDescription("Date 'YYYY-MM-DD' (for once)"))
      .addStringOption((o) => o.setName('days').setDescription("Weekly days, e.g. '1,3' or 'mon,wed' (0=Sun..6=Sat)"))
      .addIntegerOption((o) => o.setName('day_of_month').setDescription('Day of month 1-31 (monthly)').setMinValue(1).setMaxValue(31))
      .addIntegerOption((o) => o.setName('every_minutes').setDescription('Minutes between posts (interval)').setMinValue(1))
      .addStringOption((o) => o.setName('message').setDescription('Message text (or embed description if a title is set)'))
      .addStringOption((o) => o.setName('design').setDescription('Name of a saved design (overrides message/title)'))
      .addStringOption((o) => o.setName('title').setDescription('If set, posts as an embed with this title'))
      .addRoleOption((o) => o.setName('mention_role').setDescription('Role to ping with the post'))
      .addBooleanOption((o) => o.setName('pin').setDescription('Pin each post after sending')),
  )
  // ── design ──────────────────────────────────────────────────────────────────
  .addSubcommand((sub) =>
    sub.setName('design').setDescription('Open the embed builder to craft + save a reusable design'),
  )
  // ── list ──────────────────────────────────────────────────────────────────
  .addSubcommand((sub) => sub.setName('list').setDescription("List this server's auto-posts"))
  // ── edit ──────────────────────────────────────────────────────────────────
  .addSubcommand((sub) =>
    sub
      .setName('edit')
      .setDescription('Edit an existing auto-post')
      .addStringOption((o) => o.setName('id').setDescription('The auto-post id (from /autopost list)').setRequired(true))
      .addChannelOption((o) =>
        o
          .setName('channel')
          .setDescription('New channel')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
      )
      .addStringOption((o) => o.setName('message').setDescription('New message text'))
      .addStringOption((o) => o.setName('title').setDescription('New embed title'))
      .addRoleOption((o) => o.setName('mention_role').setDescription('New role to ping'))
      .addBooleanOption((o) => o.setName('pin').setDescription('Pin each post after sending'))
      .addStringOption((o) =>
        o
          .setName('type')
          .setDescription('New recurrence type (rebuilds the schedule)')
          .addChoices(
            { name: 'Once', value: 'once' },
            { name: 'Daily', value: 'daily' },
            { name: 'Weekly', value: 'weekly' },
            { name: 'Monthly', value: 'monthly' },
            { name: 'Interval', value: 'interval' },
          ),
      )
      .addStringOption((o) => o.setName('time').setDescription("New time 'HH:MM'"))
      .addStringOption((o) => o.setName('date').setDescription("New date 'YYYY-MM-DD' (once)"))
      .addStringOption((o) => o.setName('days').setDescription("New weekly days, e.g. '1,3' or 'mon,wed'"))
      .addIntegerOption((o) => o.setName('day_of_month').setDescription('New day of month 1-31').setMinValue(1).setMaxValue(31))
      .addIntegerOption((o) => o.setName('every_minutes').setDescription('New minutes between posts').setMinValue(1)),
  )
  // ── pause ──────────────────────────────────────────────────────────────────
  .addSubcommand((sub) =>
    sub
      .setName('pause')
      .setDescription('Pause an auto-post (keeps it for later)')
      .addStringOption((o) => o.setName('id').setDescription('The auto-post id').setRequired(true)),
  )
  // ── resume ──────────────────────────────────────────────────────────────────
  .addSubcommand((sub) =>
    sub
      .setName('resume')
      .setDescription('Resume a paused auto-post')
      .addStringOption((o) => o.setName('id').setDescription('The auto-post id').setRequired(true)),
  )
  // ── test ──────────────────────────────────────────────────────────────────
  .addSubcommand((sub) =>
    sub
      .setName('test')
      .setDescription('Send an auto-post once now (schedule unchanged)')
      .addStringOption((o) => o.setName('id').setDescription('The auto-post id').setRequired(true)),
  )
  // ── remove ──────────────────────────────────────────────────────────────────
  .addSubcommand((sub) =>
    sub
      .setName('remove')
      .setDescription('Cancel and delete an auto-post')
      .addStringOption((o) => o.setName('id').setDescription('The auto-post id').setRequired(true)),
  )
  // ── timezone ──────────────────────────────────────────────────────────────
  .addSubcommand((sub) =>
    sub
      .setName('timezone')
      .setDescription('Set the IANA timezone used for calendar schedules')
      .addStringOption((o) => o.setName('tz').setDescription('IANA timezone, e.g. Asia/Jerusalem').setRequired(true)),
  );

async function execute(interaction) {
  if (!isStaff(interaction.member, interaction.guildId)) {
    return interaction.reply({ content: '⛔ Staff only.', flags: MessageFlags.Ephemeral });
  }

  const sub = interaction.options.getSubcommand();
  try {
    if (sub === 'create') return await handleCreate(interaction);
    if (sub === 'design') return await handleDesign(interaction);
    if (sub === 'list') return await handleList(interaction);
    if (sub === 'edit') return await handleEdit(interaction);
    if (sub === 'pause') return await handlePause(interaction);
    if (sub === 'resume') return await handleResume(interaction);
    if (sub === 'test') return await handleTest(interaction);
    if (sub === 'remove') return await handleRemove(interaction);
    if (sub === 'timezone') return await handleTimezone(interaction);
  } catch (err) {
    logger.error('[autopost:command]', err.message);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: '⚠️ Autopost command failed.', flags: MessageFlags.Ephemeral }).catch(() => {});
    } else {
      await interaction.followUp({ content: '⚠️ Autopost command failed.', flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }
}

// Load a def that must belong to this guild; otherwise null after replying.
async function loadDef(interaction, id) {
  const def = autopost.getDef(id);
  if (!def || def.guildId !== interaction.guildId) {
    await interaction.reply({ content: `⚠️ No auto-post with id \`${id}\` here.`, flags: MessageFlags.Ephemeral });
    return null;
  }
  return def;
}

// Build a normalized schedule from create/edit options.
// Returns { schedule } on success, or { error } (already a user-facing string).
function buildScheduleFromOptions(opts, type, tz) {
  if (type === 'once') {
    const dateStr = opts.getString('date');
    const timeStr = opts.getString('time');
    const t = parseTime(timeStr);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr ?? '').trim());
    if (!m || !t) return { error: "For 'once', provide a valid date (YYYY-MM-DD) and time (HH:MM)." };
    const month = Number(m[2]);
    const day = Number(m[3]);
    const at = onceEpochFromDate({ month, day, hour: t.h, minute: t.m }, tz);
    if (!at) return { error: 'Could not resolve that date/time.' };
    return validateRaw({ type: 'once', at, tz });
  }
  if (type === 'daily') {
    return validateRaw({ type: 'daily', time: opts.getString('time'), tz });
  }
  if (type === 'weekly') {
    const days = parseDays(opts.getString('days'));
    if (!days || !days.length) return { error: "For 'weekly', provide days like '1,3' or 'mon,wed' (0=Sun..6=Sat)." };
    return validateRaw({ type: 'weekly', time: opts.getString('time'), days, tz });
  }
  if (type === 'monthly') {
    return validateRaw({ type: 'monthly', time: opts.getString('time'), dom: opts.getInteger('day_of_month'), tz });
  }
  if (type === 'interval') {
    return validateRaw({ type: 'interval', everyMinutes: opts.getInteger('every_minutes'), tz });
  }
  return { error: 'Unknown schedule type.' };
}

function validateRaw(raw) {
  const v = validateSchedule(raw);
  if (v.error) return { error: v.error };
  return { schedule: v.schedule };
}

// ── /autopost create ────────────────────────────────────────────────────────
async function handleCreate(interaction) {
  const opts = interaction.options;
  const gid = interaction.guildId;
  const channel = opts.getChannel('channel');
  const type = opts.getString('type');
  const tz = guildConfig.get(gid).autopost.timezone || DEFAULT_TZ;

  const built = buildScheduleFromOptions(opts, type, tz);
  if (built.error) {
    return interaction.reply({ content: `⛔ ${built.error}`, flags: MessageFlags.Ephemeral });
  }
  const schedule = built.schedule;

  // Build payload: a saved design, else message/title.
  const designName = opts.getString('design');
  const message = opts.getString('message');
  const title = opts.getString('title');
  const mentionRoleId = opts.getRole('mention_role')?.id || null;
  const pin = !!opts.getBoolean('pin');

  let payload;
  if (designName) {
    const embed = designs.get(gid, designName);
    if (!embed) {
      return interaction.reply({ content: `⛔ No saved design named **${designName}**.`, flags: MessageFlags.Ephemeral });
    }
    payload = { kind: 'embed', embed, mentionRoleId, pin };
  } else {
    if (!message) {
      return interaction.reply({ content: '⛔ Provide a message or a saved design.', flags: MessageFlags.Ephemeral });
    }
    payload = { kind: title ? 'embed' : 'text', content: message, title: title || null, mentionRoleId, pin };
  }

  const missing = checkSendPerms(channel, interaction.guild.members.me, false);
  if (missing.length > 0) {
    return interaction.reply({
      content: `⛔ I'm missing permissions in <#${channel.id}>: **${missing.join(', ')}**`,
      flags: MessageFlags.Ephemeral,
    });
  }

  const nextAt = nextRunAt(schedule, Date.now());
  if (!nextAt) {
    return interaction.reply({ content: '⛔ Could not compute the next run time.', flags: MessageFlags.Ephemeral });
  }

  const id = `ap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const def = {
    id,
    guildId: gid,
    channelId: channel.id,
    payload,
    schedule,
    enabled: true,
    nextAt,
    jobId: null,
    createdBy: interaction.user.id,
    createdAt: Date.now(),
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
      `• **schedule:** ${scheduleSummary(def)}\n` +
      `• **next:** <t:${unix}:F> (<t:${unix}:R>)`,
    flags: MessageFlags.Ephemeral,
  });
}

// ── /autopost design ────────────────────────────────────────────────────────
async function handleDesign(interaction) {
  const draft = initDraft(interaction.user.id, interaction.channelId);
  const panel = renderPanel(draft);
  return interaction.reply({
    ...panel,
    content:
      'Craft your embed below, then hit **💾 Save as design**. ' +
      'Schedule it later with `/autopost create design:<name>`.',
    flags: MessageFlags.Ephemeral,
  });
}

// ── /autopost list ──────────────────────────────────────────────────────────
async function handleList(interaction) {
  const defs = autopost.listForGuild(interaction.guildId);
  if (defs.length === 0) {
    return interaction.reply({ content: 'No auto-posts.', flags: MessageFlags.Ephemeral });
  }

  defs.sort((a, b) => (a.nextAt || 0) - (b.nextAt || 0));
  const lines = defs.map((d) => {
    const paused = d.schedule && d.enabled === false ? ' ⏸️ paused' : '';
    const unix = Math.floor((d.nextAt || 0) / 1000);
    const next = d.nextAt ? ` — next <t:${unix}:R>` : '';
    return `• \`${d.id}\` — <#${d.channelId}> — ${scheduleSummary(d)}${paused}${next}`;
  });

  return interaction.reply({
    content: `**Auto-posts (${defs.length}):**\n${lines.join('\n')}`,
    flags: MessageFlags.Ephemeral,
  });
}

// ── /autopost edit ──────────────────────────────────────────────────────────
async function handleEdit(interaction) {
  const opts = interaction.options;
  const gid = interaction.guildId;
  const id = opts.getString('id');
  const def = await loadDef(interaction, id);
  if (!def) return;

  if (!def.schedule) {
    return interaction.reply({
      content: '⚠️ This is a legacy auto-post — edit it the new way: remove and recreate.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const patch = {};

  // Channel change → re-preflight perms.
  const channel = opts.getChannel('channel');
  if (channel) {
    const missing = checkSendPerms(channel, interaction.guild.members.me, false);
    if (missing.length > 0) {
      return interaction.reply({
        content: `⛔ I'm missing permissions in <#${channel.id}>: **${missing.join(', ')}**`,
        flags: MessageFlags.Ephemeral,
      });
    }
    patch.channelId = channel.id;
  }

  // Payload field updates (merge onto existing payload).
  const message = opts.getString('message');
  const title = opts.getString('title');
  const mentionRole = opts.getRole('mention_role');
  const pinProvided = opts.getBoolean('pin');
  if (message !== null || title !== null || mentionRole !== null || pinProvided !== null) {
    const payload = { ...(def.payload || {}) };
    if (message !== null) payload.content = message;
    if (title !== null) {
      payload.title = title || null;
      payload.kind = title ? 'embed' : (payload.embed ? 'embed' : 'text');
    }
    if (mentionRole !== null) payload.mentionRoleId = mentionRole?.id || null;
    if (pinProvided !== null) payload.pin = !!pinProvided;
    patch.payload = payload;
  }

  // Schedule re-spec.
  const type = opts.getString('type');
  let newNextLine = '';
  if (type) {
    const tz = guildConfig.get(gid).autopost.timezone || DEFAULT_TZ;
    const built = buildScheduleFromOptions(opts, type, tz);
    if (built.error) {
      return interaction.reply({ content: `⛔ ${built.error}`, flags: MessageFlags.Ephemeral });
    }
    const schedule = built.schedule;
    const nextAt = nextRunAt(schedule, Date.now());
    if (!nextAt) {
      return interaction.reply({ content: '⛔ Could not compute the next run time.', flags: MessageFlags.Ephemeral });
    }
    // Cancel the old job, schedule the new one.
    if (def.jobId) {
      try { scheduler.cancel(def.jobId); } catch (e) { logger.error('[autopost:edit] cancel', e.message); }
    }
    const jobId = def.enabled === false ? null : scheduler.schedule('autopost', nextAt, { id });
    patch.schedule = schedule;
    patch.nextAt = nextAt;
    patch.jobId = jobId;
    const unix = Math.floor(nextAt / 1000);
    newNextLine = `\n• **next:** <t:${unix}:F> (<t:${unix}:R>)`;
  }

  if (Object.keys(patch).length === 0) {
    return interaction.reply({ content: 'ℹ️ Nothing to change — provide at least one field.', flags: MessageFlags.Ephemeral });
  }

  await autopost.patchDef(id, patch);
  const updated = autopost.getDef(id);
  return interaction.reply({
    content:
      `✅ Updated auto-post \`${id}\`.\n` +
      `• **channel:** <#${updated.channelId}>\n` +
      `• **schedule:** ${scheduleSummary(updated)}${newNextLine}`,
    flags: MessageFlags.Ephemeral,
  });
}

// ── /autopost pause ─────────────────────────────────────────────────────────
async function handlePause(interaction) {
  const id = interaction.options.getString('id');
  const def = await loadDef(interaction, id);
  if (!def) return;

  if (def.jobId) {
    try { scheduler.cancel(def.jobId); } catch (e) { logger.error('[autopost:pause] cancel', e.message); }
  }
  await autopost.patchDef(id, { enabled: false, jobId: null });
  return interaction.reply({ content: `⏸️ Paused auto-post \`${id}\`.`, flags: MessageFlags.Ephemeral });
}

// ── /autopost resume ────────────────────────────────────────────────────────
async function handleResume(interaction) {
  const id = interaction.options.getString('id');
  const def = await loadDef(interaction, id);
  if (!def) return;

  if (!def.schedule) {
    return interaction.reply({ content: '⚠️ Legacy auto-post — remove and recreate instead.', flags: MessageFlags.Ephemeral });
  }
  if (def.enabled !== false) {
    return interaction.reply({ content: 'ℹ️ That auto-post is already running.', flags: MessageFlags.Ephemeral });
  }

  const nextAt = nextRunAt(def.schedule, Date.now());
  if (!nextAt) {
    return interaction.reply({ content: '⛔ Cannot resume — the schedule has expired.', flags: MessageFlags.Ephemeral });
  }
  const jobId = scheduler.schedule('autopost', nextAt, { id });
  await autopost.patchDef(id, { enabled: true, nextAt, jobId });

  const unix = Math.floor(nextAt / 1000);
  return interaction.reply({
    content: `▶️ Resumed auto-post \`${id}\`. Next: <t:${unix}:F> (<t:${unix}:R>).`,
    flags: MessageFlags.Ephemeral,
  });
}

// ── /autopost test ──────────────────────────────────────────────────────────
async function handleTest(interaction) {
  const id = interaction.options.getString('id');
  const def = await loadDef(interaction, id);
  if (!def) return;

  if (!def.schedule) {
    return interaction.reply({ content: '⚠️ Test only supports new-style posts.', flags: MessageFlags.Ephemeral });
  }

  const channel =
    interaction.guild.channels.cache.get(def.channelId) ||
    (await interaction.guild.channels.fetch(def.channelId).catch(() => null));
  if (!channel || typeof channel.send !== 'function') {
    return interaction.reply({ content: `⛔ Channel <#${def.channelId}> not found.`, flags: MessageFlags.Ephemeral });
  }

  const missing = checkSendPerms(channel, interaction.guild.members.me, false);
  if (missing.length > 0) {
    return interaction.reply({
      content: `⛔ I'm missing permissions in <#${channel.id}>: **${missing.join(', ')}**`,
      flags: MessageFlags.Ephemeral,
    });
  }

  await autopost.sendPost(channel, def);
  return interaction.reply({ content: '✅ Sent a test now (schedule unchanged).', flags: MessageFlags.Ephemeral });
}

// ── /autopost remove ────────────────────────────────────────────────────────
async function handleRemove(interaction) {
  const id = interaction.options.getString('id');
  const def = await loadDef(interaction, id);
  if (!def) return;

  if (def.jobId) {
    try { scheduler.cancel(def.jobId); } catch (e) { logger.error('[autopost:remove] cancel', e.message); }
  }
  await autopost.deleteDef(id);
  return interaction.reply({ content: `🗑️ Removed auto-post \`${id}\`.`, flags: MessageFlags.Ephemeral });
}

// ── /autopost timezone ──────────────────────────────────────────────────────
async function handleTimezone(interaction) {
  const tz = interaction.options.getString('tz');
  if (!isValidTz(tz)) {
    return interaction.reply({ content: '⛔ Invalid IANA timezone, e.g. Asia/Jerusalem.', flags: MessageFlags.Ephemeral });
  }
  guildConfig.set(interaction.guildId, { autopost: { timezone: tz } });
  return interaction.reply({ content: `✅ Timezone set to \`${tz}\`.`, flags: MessageFlags.Ephemeral });
}

module.exports = { data, execute, bypassModGate: true };
