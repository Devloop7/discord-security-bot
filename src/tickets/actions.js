// src/tickets/actions.js — ticket lifecycle actions.
//
// Every card is re-rendered from the ticket record (see ./embeds) instead of
// being patched field-by-field, so the visuals stay consistent through claim →
// priority → close → reopen. Adds full Add User / Remove User / Transcript
// support and a confirmation step before closing.
'use strict';

const {
  ChannelType,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');

const scheduler = require('../core/scheduler');
const logger = require('../core/logger');
const { COLORS, EMOJI, PRIORITY } = require('../ui/theme');
const {
  getConfig, setConfig, nextCounter,
  getTicket, createTicket, updateTicket, openCount,
} = require('../core/ticketStore');
const {
  controlRows, closedRows, closeConfirmRow, addUserRow, removeUserRow,
} = require('./constants');
const {
  buildTicketEmbed, noticeEmbed, confirmCloseEmbed, closedEmbed,
  dmClosedEmbed, deleteEmbed, transcriptEmbed,
} = require('./embeds');
const { isStaff, canManageTicket, canCloseTicket } = require('./permissions');
const { generateHtml } = require('./transcript');
const { logTicketEvent } = require('./log');

// ── 2FA helper ───────────────────────────────────────────────────────────────
function isTwoFactorError(e) {
  return e && (e.code === 60003 || e.code === 40002 || /two[- ]?factor|2fa/i.test(String(e.message || '')));
}
const TWO_FA_MSG =
  "⚠️ I couldn't create the ticket channel because this server **requires 2FA for moderation**. " +
  'The account that OWNS the bot must enable Two-Factor Authentication ' +
  '(Discord → User Settings → My Account → Enable Two-Factor Auth). Then try again.';

// ── small helpers ────────────────────────────────────────────────────────────
async function replyEphemeral(interaction, content) {
  try {
    if (interaction.deferred || interaction.replied) {
      return await interaction.editReply({ content, embeds: [], components: [] });
    }
    return await interaction.reply({ content, flags: MessageFlags.Ephemeral });
  } catch { /* interaction expired — ignore */ }
}

async function fetchMessage(channel, msgId) {
  if (!msgId || !channel) return null;
  try { return await channel.messages.fetch(msgId); } catch { return null; }
}

const PERMS_VIEW = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.ReadMessageHistory,
];

// Re-render the pinned welcome card from current ticket state.
async function rerenderWelcome(channel, ticket, cfg) {
  const welcomeMsg = await fetchMessage(channel, ticket.welcomeMessageId);
  if (!welcomeMsg) return;
  const opener = await channel.client.users.fetch(ticket.userId).catch(() => null);
  const embed = buildTicketEmbed(channel, ticket, { opener });
  const components = ticket.status === 'closed'
    ? []
    : controlRows({ claimed: !!ticket.claimedBy, enablePriority: cfg.enablePriority });
  await welcomeMsg.edit({ embeds: [embed], components }).catch((e) => logger.warn('[ticket:rerender]', e.message));
}

// ── openTicket ───────────────────────────────────────────────────────────────
async function openTicket(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const { guildId, guild, member } = interaction;
  const cfg = getConfig(guildId);
  const opener = member;

  if (openCount(guildId, opener.id) >= cfg.maxTicketsPerUser) {
    return interaction.editReply(`You've reached the max of ${cfg.maxTicketsPerUser} open tickets.`);
  }

  const reason = interaction.fields.getTextInputValue('reason');
  const num = nextCounter(guildId);

  // Resolve / create category.
  let { categoryId } = cfg;
  if (!categoryId) {
    const found = guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildCategory && c.name.toLowerCase().includes('tickets'),
    );
    if (found) categoryId = found.id;
    else {
      const created = await guild.channels.create({
        name: 'Tickets', type: ChannelType.GuildCategory,
        permissionOverwrites: [{ id: guild.id, deny: [PermissionFlagsBits.ViewChannel] }],
      });
      categoryId = created.id;
    }
    setConfig(guildId, { categoryId });
  }

  const permissionOverwrites = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: opener.id, allow: PERMS_VIEW },
  ];
  if (cfg.staffRoleId) permissionOverwrites.push({ id: cfg.staffRoleId, allow: PERMS_VIEW });

  let channel;
  try {
    channel = await guild.channels.create({
      name: `ticket-${num}`, type: ChannelType.GuildText, parent: categoryId, permissionOverwrites,
    });
  } catch (err) {
    logger.error('[ticket:open] channel create failed:', err.message);
    return interaction.editReply(isTwoFactorError(err) ? TWO_FA_MSG : '⚠️ Failed to create the ticket channel. Please try again later.');
  }

  const ticket = {
    userId: opener.id, guildId, reason, priority: 'none', number: num,
    createdAt: Date.now(), status: 'open', welcomeMessageId: null, claimMsgId: null,
  };

  const embed = buildTicketEmbed(channel, ticket, { opener });
  const mentionContent = [`<@${opener.id}>`, cfg.staffRoleId ? `<@&${cfg.staffRoleId}>` : '']
    .filter(Boolean).join(' ');

  const sent = await channel.send({
    content: mentionContent,
    embeds: [embed],
    components: controlRows({ claimed: false, enablePriority: cfg.enablePriority }),
    allowedMentions: { users: [opener.id], roles: cfg.staffRoleId ? [cfg.staffRoleId] : [] },
  });
  await sent.pin().catch(() => {});

  createTicket(channel.id, { ...ticket, welcomeMessageId: sent.id });

  await logTicketEvent(guild, 'open', {
    fields: [
      { name: `${EMOJI.ticket} Ticket`, value: `#${num}`, inline: true },
      { name: `${EMOJI.owner} Creator`, value: `<@${opener.id}>`, inline: true },
      { name: 'Channel', value: `<#${channel.id}>`, inline: true },
      { name: `${EMOJI.reason} Reason`, value: reason.slice(0, 1000) },
    ],
  });

  await interaction.editReply(`${EMOJI.ticket} Your ticket is ready: <#${channel.id}>`);
}

// ── claim / unclaim ──────────────────────────────────────────────────────────
async function claim(interaction) {
  const { channelId, guildId, guild, member, channel } = interaction;
  const ticket = getTicket(channelId);
  if (!ticket) return replyEphemeral(interaction, 'Not a ticket channel.');
  if (!canManageTicket(member, guildId)) return replyEphemeral(interaction, '⛔ Staff only.');
  if (ticket.claimedBy) return replyEphemeral(interaction, `Already claimed by <@${ticket.claimedBy}>.`);

  const cfg = getConfig(guildId);
  const updated = updateTicket(channelId, { claimedBy: member.id, claimedAt: Date.now() });
  await rerenderWelcome(channel, updated, cfg);

  await channel.send({ embeds: [noticeEmbed(channel, {
    color: COLORS.brand,
    body: `${EMOJI.claim}  <@${member.id}> claimed this ticket and will be assisting you.`,
  })] }).catch(() => {});

  await replyEphemeral(interaction, `${EMOJI.success} You claimed this ticket.`);
  await logTicketEvent(guild, 'claim', {
    fields: [
      { name: 'Ticket', value: `#${ticket.number || channel.name}`, inline: true },
      { name: 'Claimed by', value: `<@${member.id}>`, inline: true },
    ],
  });
}

async function unclaim(interaction) {
  const { channelId, guildId, guild, member, channel } = interaction;
  const ticket = getTicket(channelId);
  if (!ticket) return replyEphemeral(interaction, 'Not a ticket channel.');
  if (member.id !== ticket.claimedBy && !isStaff(member, guildId)) {
    return replyEphemeral(interaction, '⛔ You cannot unclaim this ticket.');
  }

  const cfg = getConfig(guildId);
  const updated = updateTicket(channelId, { claimedBy: null, claimedAt: null });
  await rerenderWelcome(channel, updated, cfg);

  await channel.send({ embeds: [noticeEmbed(channel, {
    color: COLORS.warning,
    body: `${EMOJI.unclaim}  <@${member.id}> released this ticket — it's open for any staff member.`,
  })] }).catch(() => {});

  await replyEphemeral(interaction, `${EMOJI.success} Unclaimed.`);
  await logTicketEvent(guild, 'unclaim', {
    fields: [
      { name: 'Ticket', value: `#${ticket.number || channel.name}`, inline: true },
      { name: 'Unclaimed by', value: `<@${member.id}>`, inline: true },
    ],
  });
}

// ── setPriority (from the select menu) ───────────────────────────────────────
async function setPriority(interaction, level) {
  const { channelId, guildId, guild, member, channel } = interaction;
  if (!canManageTicket(member, guildId)) return replyEphemeral(interaction, '⛔ Staff only.');
  if (!PRIORITY[level]) return replyEphemeral(interaction, `⚠️ Unknown priority level: ${level}`);

  const ticket = getTicket(channelId);
  if (!ticket) return replyEphemeral(interaction, 'Not a ticket channel.');

  const cfg = getConfig(guildId);
  const updated = updateTicket(channelId, { priority: level });
  await rerenderWelcome(channel, updated, cfg);

  const p = PRIORITY[level];
  await channel.send({ embeds: [noticeEmbed(channel, {
    color: p.color,
    body: `${EMOJI.priority}  Priority set to **${p.emoji} ${p.label}** by <@${member.id}>.`,
  })] }).catch(() => {});

  await replyEphemeral(interaction, `${EMOJI.success} Priority updated to ${p.label}.`);
  await logTicketEvent(guild, 'priority', {
    fields: [
      { name: 'Ticket', value: `#${ticket.number || channel.name}`, inline: true },
      { name: 'Priority', value: `${p.emoji} ${p.label}`, inline: true },
      { name: 'Updated by', value: `<@${member.id}>`, inline: true },
    ],
  });
}

// ── close confirmation UI ────────────────────────────────────────────────────
async function promptClose(interaction) {
  const ticket = getTicket(interaction.channelId);
  if (!ticket) return replyEphemeral(interaction, 'Not a ticket channel.');
  if (!canCloseTicket(interaction.member, interaction.guildId, ticket)) {
    return replyEphemeral(interaction, "⛔ You can't close this ticket.");
  }
  return interaction.reply({
    embeds: [confirmCloseEmbed(interaction)],
    components: closeConfirmRow(),
    flags: MessageFlags.Ephemeral,
  });
}

// ── close ────────────────────────────────────────────────────────────────────
async function close(interaction, reason) {
  const { channelId, guildId, guild, member, channel } = interaction;
  const ticket = getTicket(channelId);
  if (!ticket) return replyEphemeral(interaction, 'Not a ticket channel.');
  if (!canCloseTicket(member, guildId, ticket)) return replyEphemeral(interaction, "⛔ You can't close this ticket.");

  // Acknowledge: collapse the ephemeral confirm UI, or defer a fresh reply.
  if (interaction.isButton?.() && interaction.customId === 'ticket_close_confirm') {
    await interaction.update({ content: `${EMOJI.loading} Closing…`, embeds: [], components: [] }).catch(() => {});
  } else if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
  }

  const cfg = getConfig(guildId);
  const updated = updateTicket(channelId, {
    status: 'closed', closedBy: member.id, closedAt: Date.now(), closeReason: reason,
  });

  if (cfg.closedCategoryId) {
    await channel.setParent(cfg.closedCategoryId, { lockPermissions: false }).catch(() => {});
  }
  await channel.permissionOverwrites.edit(ticket.userId, { ViewChannel: false, SendMessages: false }).catch(() => {});

  await rerenderWelcome(channel, updated, cfg);

  await channel.send({
    embeds: [closedEmbed(channel, updated, { byId: member.id, reason })],
    components: closedRows(),
  }).catch(() => {});

  if (cfg.dmOnClose) {
    try {
      const opener = await interaction.client.users.fetch(ticket.userId);
      await opener.send({ embeds: [dmClosedEmbed(channel, updated, {
        reason, byTag: member.user.tag, guildName: guild.name,
      })] });
      await require('./feedback').sendSurvey(opener, guildId, channelId);
    } catch { /* DMs disabled — ignore */ }
  }

  await logTicketEvent(guild, 'close', {
    fields: [
      { name: 'Ticket', value: `#${ticket.number || channel.name}`, inline: true },
      { name: 'Closed by', value: `<@${member.id}>`, inline: true },
      { name: 'Channel', value: `<#${channelId}>`, inline: true },
      { name: `${EMOJI.reason} Reason`, value: String(reason).slice(0, 1000) },
    ],
  });

  await replyEphemeral(interaction, `${EMOJI.close} Ticket closed.`);
}

// ── reopen ───────────────────────────────────────────────────────────────────
async function reopen(interaction) {
  const { channelId, guildId, guild, member, channel } = interaction;
  const ticket = getTicket(channelId);
  if (!ticket) return replyEphemeral(interaction, 'Not a ticket channel.');
  if (!canManageTicket(member, guildId)) return replyEphemeral(interaction, '⛔ Staff only.');

  const cfg = getConfig(guildId);
  const updated = updateTicket(channelId, { status: 'open', closedBy: null, closedAt: null, closeReason: null });

  if (cfg.categoryId) await channel.setParent(cfg.categoryId, { lockPermissions: false }).catch(() => {});
  await channel.permissionOverwrites.edit(ticket.userId, {
    ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true,
  }).catch(() => {});

  await rerenderWelcome(channel, updated, cfg);

  // Collapse the closed-card the Reopen button lives on.
  try {
    await interaction.update({
      embeds: [noticeEmbed(channel, { color: COLORS.success, title: `${EMOJI.reopen}  Ticket Reopened`, body: `Reopened by <@${member.id}>.` })],
      components: [],
    });
  } catch (e) { logger.warn('[ticket:reopen] edit close-card:', e.message); }

  await logTicketEvent(guild, 'reopen', {
    fields: [
      { name: 'Ticket', value: `#${ticket.number || channel.name}`, inline: true },
      { name: 'Reopened by', value: `<@${member.id}>`, inline: true },
      { name: 'Channel', value: `<#${channelId}>`, inline: true },
    ],
  });
}

// ── add / remove user ────────────────────────────────────────────────────────
async function promptAddUser(interaction) {
  const { guildId, member } = interaction;
  if (!getTicket(interaction.channelId)) return replyEphemeral(interaction, 'Not a ticket channel.');
  if (!canManageTicket(member, guildId)) return replyEphemeral(interaction, '⛔ Staff only.');
  return interaction.reply({
    embeds: [noticeEmbed(interaction, { color: COLORS.brand, title: `${EMOJI.addUser}  Add a member`, body: 'Select a member to grant access to this ticket.' })],
    components: addUserRow(),
    flags: MessageFlags.Ephemeral,
  });
}

async function promptRemoveUser(interaction) {
  const { guildId, member } = interaction;
  if (!getTicket(interaction.channelId)) return replyEphemeral(interaction, 'Not a ticket channel.');
  if (!canManageTicket(member, guildId)) return replyEphemeral(interaction, '⛔ Staff only.');
  return interaction.reply({
    embeds: [noticeEmbed(interaction, { color: COLORS.warning, title: `${EMOJI.removeUser}  Remove a member`, body: 'Select a member to revoke access from this ticket.' })],
    components: removeUserRow(),
    flags: MessageFlags.Ephemeral,
  });
}

async function handleAddUserSelect(interaction) {
  const { guildId, member, channel } = interaction;
  const ticket = getTicket(channel.id);
  if (!ticket) return replyEphemeral(interaction, 'Not a ticket channel.');
  if (!canManageTicket(member, guildId)) return replyEphemeral(interaction, '⛔ Staff only.');

  const targetId = interaction.values[0];
  await channel.permissionOverwrites.edit(targetId, {
    ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true,
  });

  await channel.send({ embeds: [noticeEmbed(channel, {
    color: COLORS.success, body: `${EMOJI.addUser}  <@${targetId}> was added to the ticket by <@${member.id}>.`,
  })] }).catch(() => {});

  await interaction.update({
    embeds: [noticeEmbed(interaction, { color: COLORS.success, title: `${EMOJI.success}  Member added`, body: `<@${targetId}> now has access to this ticket.` })],
    components: [],
  });

  await logTicketEvent(interaction.guild, 'adduser', {
    fields: [
      { name: 'Ticket', value: `#${ticket.number || channel.name}`, inline: true },
      { name: 'Added', value: `<@${targetId}>`, inline: true },
      { name: 'By', value: `<@${member.id}>`, inline: true },
    ],
  });
}

async function handleRemoveUserSelect(interaction) {
  const { guildId, member, channel } = interaction;
  const ticket = getTicket(channel.id);
  if (!ticket) return replyEphemeral(interaction, 'Not a ticket channel.');
  if (!canManageTicket(member, guildId)) return replyEphemeral(interaction, '⛔ Staff only.');

  const targetId = interaction.values[0];
  if (targetId === ticket.userId) {
    return interaction.update({
      embeds: [noticeEmbed(interaction, { color: COLORS.danger, title: `${EMOJI.error}  Can't remove the owner`, body: 'The ticket owner can\'t be removed. Close the ticket instead.' })],
      components: [],
    });
  }

  await channel.permissionOverwrites.delete(targetId).catch(() => {});

  await channel.send({ embeds: [noticeEmbed(channel, {
    color: COLORS.warning, body: `${EMOJI.removeUser}  <@${targetId}> was removed from the ticket by <@${member.id}>.`,
  })] }).catch(() => {});

  await interaction.update({
    embeds: [noticeEmbed(interaction, { color: COLORS.warning, title: `${EMOJI.success}  Member removed`, body: `<@${targetId}> no longer has access.` })],
    components: [],
  });

  await logTicketEvent(interaction.guild, 'removeuser', {
    fields: [
      { name: 'Ticket', value: `#${ticket.number || channel.name}`, inline: true },
      { name: 'Removed', value: `<@${targetId}>`, inline: true },
      { name: 'By', value: `<@${member.id}>`, inline: true },
    ],
  });
}

// ── on-demand transcript ─────────────────────────────────────────────────────
async function sendTranscript(interaction) {
  const { guildId, member, channel } = interaction;
  const ticket = getTicket(channel.id);
  if (!ticket) return replyEphemeral(interaction, 'Not a ticket channel.');
  if (!canManageTicket(member, guildId)) return replyEphemeral(interaction, '⛔ Staff only.');

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const { buffer, filename, count } = await generateHtml(channel);
  await interaction.editReply({
    embeds: [transcriptEmbed(interaction, ticket, { channelName: channel.name, byTag: interaction.user.tag, messageCount: count })],
    files: [{ attachment: buffer, name: filename }],
  });

  await logTicketEvent(interaction.guild, 'transcript', {
    fields: [
      { name: 'Ticket', value: `#${ticket.number || channel.name}`, inline: true },
      { name: 'Requested by', value: `<@${member.id}>`, inline: true },
    ],
  });
}

// ── delete (+ archive transcript) ────────────────────────────────────────────
async function deleteTicket(interaction) {
  const { guildId, guild, member, channel } = interaction;
  if (!canManageTicket(member, guildId)) return replyEphemeral(interaction, '⛔ Staff only.');

  const ticket = getTicket(channel.id);
  const ticketNum = ticket?.number || channel.name;

  await channel.send({ embeds: [deleteEmbed(channel, 5)] }).catch(() => {});
  await replyEphemeral(interaction, `${EMOJI.delete} Deleting in 5 seconds…`);

  await logTicketEvent(guild, 'delete', {
    fields: [
      { name: 'Ticket', value: `#${ticketNum}`, inline: true },
      { name: 'Deleted by', value: `<@${member.id}>`, inline: true },
    ],
  });

  scheduler.schedule('ticket-delete', Date.now() + 5000, {
    guildId, channelId: channel.id, number: ticket?.number || null, byTag: interaction.user.tag,
  });
}

async function performTicketDelete(data, client) {
  try {
    const { guildId, channelId, byTag } = data;
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) return;

    const ticket = getTicket(channelId);
    const { buffer, filename, count } = await generateHtml(channel);

    const cfg = getConfig(guildId);
    if (cfg.transcriptChannelId) {
      const tc = await client.channels.fetch(cfg.transcriptChannelId).catch(() => null);
      if (tc) {
        await tc.send({
          embeds: [transcriptEmbed(tc, ticket || { number: data.number }, { channelName: channel.name, byTag, messageCount: count })],
          files: [{ attachment: buffer, name: filename }],
        }).catch(() => {});
      }
    }

    await channel.delete().catch(() => {});
  } catch (e) {
    logger.error('[ticket:delete] performTicketDelete error:', e.message);
  }
}

module.exports = {
  openTicket, claim, unclaim, setPriority,
  promptClose, close, reopen,
  promptAddUser, promptRemoveUser, handleAddUserSelect, handleRemoveUserSelect,
  sendTranscript, deleteTicket, performTicketDelete,
  isTwoFactorError, TWO_FA_MSG,
};
