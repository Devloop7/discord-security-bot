// src/tickets/actions.js — ticket lifecycle actions: open, claim, unclaim, pin, setPriority.
'use strict';

const {
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');

// ---------------------------------------------------------------------------
// 2FA error helper
// ---------------------------------------------------------------------------

/**
 * Returns true when the Discord API error indicates the server requires 2FA
 * for moderation actions and the bot owner hasn't enabled it.
 * Primary code: 60003 (MFA required).  Also catches 40002 and message-based checks.
 */
function isTwoFactorError(e) {
  return e && (
    e.code === 60003 ||
    e.code === 40002 ||
    /two[- ]?factor|2fa/i.test(String(e.message || ''))
  );
}

const TWO_FA_MSG =
  "⚠️ I couldn't create the ticket channel because this server **requires 2FA for moderation**. " +
  'The account that OWNS the bot must enable Two-Factor Authentication ' +
  '(Discord → User Settings → My Account → Enable Two-Factor Auth). ' +
  'After enabling it, try again.';

const {
  getConfig, setConfig, nextCounter,
  getTicket, createTicket, updateTicket, openCount,
} = require('../core/ticketStore');
const { PRIORITY, COLORS, controlRow, closedRow } = require('./constants');
const { isStaff, canManageTicket, canCloseTicket } = require('./permissions');
const { generateHtml } = require('./transcript');
const { logTicketEvent } = require('./log');
const logger = require('../core/logger');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Reply ephemeral text on an already-deferred or fresh interaction. */
async function replyEphemeral(interaction, content) {
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply({ content });
  }
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

/**
 * Safely fetch a message from a channel by id.
 * Returns null if not found / any error.
 */
async function fetchMessage(channel, msgId) {
  if (!msgId || !channel) return null;
  try {
    return await channel.messages.fetch(msgId);
  } catch {
    return null;
  }
}

/**
 * Rebuild the fields array of the welcome embed, replacing the value of the
 * field whose name matches `fieldName` with `newValue`.
 * Returns a new array (does not mutate).
 */
function replaceField(fields, fieldName, newValue) {
  return fields.map((f) =>
    f.name === fieldName ? { ...f, value: newValue } : { ...f },
  );
}

// ---------------------------------------------------------------------------
// openTicket
// ---------------------------------------------------------------------------

/**
 * Called from the create_ticket_modal submit.
 * Creates the ticket channel, welcome message, and persists the record.
 */
async function openTicket(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const { guildId, guild, member } = interaction;
  const cfg = getConfig(guildId);
  const opener = member;

  // Re-check per-user open-ticket limit.
  if (openCount(guildId, opener.id) >= cfg.maxTicketsPerUser) {
    return interaction.editReply(
      `You've reached the max of ${cfg.maxTicketsPerUser} open tickets.`,
    );
  }

  const reason = interaction.fields.getTextInputValue('reason');
  const num = nextCounter(guildId); // e.g. "001"

  // ── Resolve or create the ticket category ──────────────────────────────
  let { categoryId } = cfg;

  if (!categoryId) {
    // Try to find an existing category whose name contains "tickets".
    const found = guild.channels.cache.find(
      (c) =>
        c.type === ChannelType.GuildCategory &&
        c.name.toLowerCase().includes('tickets'),
    );

    if (found) {
      categoryId = found.id;
    } else {
      // Create one.
      const created = await guild.channels.create({
        name: 'Tickets',
        type: ChannelType.GuildCategory,
        permissionOverwrites: [
          { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        ],
      });
      categoryId = created.id;
    }

    setConfig(guildId, { categoryId });
  }

  // ── Create the ticket channel ──────────────────────────────────────────
  const permissionOverwrites = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: opener.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    },
  ];

  if (cfg.staffRoleId) {
    permissionOverwrites.push({
      id: cfg.staffRoleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    });
  }

  let channel;
  try {
    channel = await guild.channels.create({
      name: `ticket-${num}`,
      type: ChannelType.GuildText,
      parent: categoryId,
      permissionOverwrites,
    });
  } catch (err) {
    logger.error('[ticket:open] channel create failed:', err.message);
    if (isTwoFactorError(err)) {
      return interaction.editReply(TWO_FA_MSG);
    }
    return interaction.editReply('⚠️ Failed to create the ticket channel. Please try again later.');
  }

  // ── Build welcome embed ────────────────────────────────────────────────
  const createdTs = Math.floor(Date.now() / 1000);
  const welcome = new EmbedBuilder()
    .setTitle(`Ticket #${num}`)
    .setDescription(
      `${opener}, thanks for creating a ticket!\n\n` +
      `**Reason:** ${reason}\n` +
      `**Priority:** ${PRIORITY.none.emoji} ${PRIORITY.none.label}`,
    )
    .setColor(PRIORITY.none.color)
    .addFields(
      { name: 'Status',     value: '🟢 Open',       inline: true },
      { name: 'Claimed By', value: 'Not claimed',    inline: true },
      { name: 'Created',    value: `<t:${createdTs}:R>`, inline: true },
    );

  // ── Send welcome message ───────────────────────────────────────────────
  const mentionContent = [
    `${opener}`,
    cfg.staffRoleId ? `<@&${cfg.staffRoleId}>` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const sent = await channel.send({
    content: mentionContent,
    embeds: [welcome],
    components: [controlRow({ claimed: false, enablePriority: cfg.enablePriority })],
  });

  await sent.pin().catch(() => {});

  // ── Persist ticket record ──────────────────────────────────────────────
  createTicket(channel.id, {
    userId: opener.id,
    guildId,
    reason,
    priority: 'none',
    number: num,
    welcomeMessageId: sent.id,
    claimMsgId: null,
  });

  // ── Log ────────────────────────────────────────────────────────────────
  await logTicketEvent(guild, 'open', {
    fields: [
      { name: 'Ticket',  value: `#${num}`,            inline: true },
      { name: 'Creator', value: `<@${opener.id}>`,    inline: true },
      { name: 'Channel', value: `<#${channel.id}>`,   inline: true },
      { name: 'Reason',  value: reason.slice(0, 1000) },
    ],
  });

  await interaction.editReply(`🎫 Ticket created: <#${channel.id}>`);
}

// ---------------------------------------------------------------------------
// claim
// ---------------------------------------------------------------------------

async function claim(interaction) {
  const { channelId, guildId, guild, member, channel } = interaction;

  const ticket = getTicket(channelId);
  if (!ticket) return replyEphemeral(interaction, 'Not a ticket channel.');
  if (!canManageTicket(member, guildId)) return replyEphemeral(interaction, '⛔ Staff only.');
  if (ticket.claimedBy) {
    return replyEphemeral(interaction, `Already claimed by <@${ticket.claimedBy}>.`);
  }

  const cfg = getConfig(guildId);
  updateTicket(channelId, { claimedBy: member.id, claimedAt: Date.now() });

  // Edit welcome message — replace "Claimed By" field and update control row.
  const welcomeMsg = await fetchMessage(channel, ticket.welcomeMessageId);
  if (welcomeMsg?.embeds?.[0]) {
    try {
      const oldEmbed = welcomeMsg.embeds[0];
      const newFields = replaceField(
        oldEmbed.fields,
        'Claimed By',
        `<@${member.id}>`,
      );
      const updatedEmbed = EmbedBuilder.from(oldEmbed).setFields(newFields);
      await welcomeMsg.edit({
        embeds: [updatedEmbed],
        components: [controlRow({ claimed: true, enablePriority: cfg.enablePriority })],
      });
    } catch (e) {
      logger.warn('[ticket:claim] could not edit welcome msg:', e.message);
    }
  }

  // Post / refresh claim status message.
  const claimEmbed = new EmbedBuilder()
    .setTitle('Ticket Claimed')
    .setDescription(`🎉 <@${member.id}> has claimed this ticket!`)
    .setColor(COLORS.claim);

  const unclaimRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_unclaim')
      .setLabel('Unclaim')
      .setEmoji('🔓')
      .setStyle(ButtonStyle.Secondary),
  );

  const existingClaimMsg = await fetchMessage(channel, ticket.claimMsgId);
  if (existingClaimMsg) {
    await existingClaimMsg.edit({ embeds: [claimEmbed], components: [unclaimRow] }).catch(() => {});
  } else {
    const sent = await channel.send({ embeds: [claimEmbed], components: [unclaimRow] }).catch(() => null);
    if (sent) updateTicket(channelId, { claimMsgId: sent.id });
  }

  await interaction.reply({ content: '✅ You claimed this ticket.', flags: MessageFlags.Ephemeral });

  const ticketNum = ticket.number || channel.name;
  await logTicketEvent(guild, 'claim', {
    fields: [
      { name: 'Ticket',     value: `#${ticketNum}`,       inline: true },
      { name: 'Claimed by', value: `<@${member.id}>`,     inline: true },
    ],
  });
}

// ---------------------------------------------------------------------------
// unclaim
// ---------------------------------------------------------------------------

async function unclaim(interaction) {
  const { channelId, guildId, guild, member, channel } = interaction;

  const ticket = getTicket(channelId);
  if (!ticket) return replyEphemeral(interaction, 'Not a ticket channel.');

  // Permission: the claimer OR any staff member.
  if (member.id !== ticket.claimedBy && !isStaff(member, guildId)) {
    return replyEphemeral(interaction, '⛔ You cannot unclaim this ticket.');
  }

  const cfg = getConfig(guildId);
  updateTicket(channelId, { claimedBy: null, claimedAt: null });

  // Edit welcome message — restore "Claimed By" to "Not claimed".
  const welcomeMsg = await fetchMessage(channel, ticket.welcomeMessageId);
  if (welcomeMsg?.embeds?.[0]) {
    try {
      const oldEmbed = welcomeMsg.embeds[0];
      const newFields = replaceField(oldEmbed.fields, 'Claimed By', 'Not claimed');
      const updatedEmbed = EmbedBuilder.from(oldEmbed).setFields(newFields);
      await welcomeMsg.edit({
        embeds: [updatedEmbed],
        components: [controlRow({ claimed: false, enablePriority: cfg.enablePriority })],
      });
    } catch (e) {
      logger.warn('[ticket:unclaim] could not edit welcome msg:', e.message);
    }
  }

  // Edit claim status message — show unclaimed state with no action buttons.
  const claimMsg = await fetchMessage(channel, ticket.claimMsgId);
  if (claimMsg) {
    const unclaimEmbed = new EmbedBuilder()
      .setTitle('Ticket Unclaimed')
      .setDescription(`🔓 <@${member.id}> has unclaimed this ticket!`)
      .setColor(COLORS.unclaim);
    await claimMsg.edit({ embeds: [unclaimEmbed], components: [] }).catch(() => {});
  }

  await interaction.reply({ content: '✅ Unclaimed.', flags: MessageFlags.Ephemeral });

  const ticketNum = ticket.number || channel.name;
  await logTicketEvent(guild, 'unclaim', {
    fields: [
      { name: 'Ticket',      value: `#${ticketNum}`,      inline: true },
      { name: 'Unclaimed by', value: `<@${member.id}>`,   inline: true },
    ],
  });
}

// ---------------------------------------------------------------------------
// pin
// ---------------------------------------------------------------------------

async function pin(interaction) {
  const { guildId, guild, member, channel } = interaction;

  if (!canManageTicket(member, guildId)) {
    return replyEphemeral(interaction, '⛔ Staff only.');
  }

  const ticket = getTicket(channel.id);
  const ticketNum = ticket?.number || channel.name;
  const currentName = channel.name;

  try {
    if (currentName.startsWith('📌 ') || currentName.startsWith('📌-')) {
      // Already pinned — unpin.
      // Handle both "📌 ticket-001" and "📌-ticket-001" naming variants.
      const newName = currentName.startsWith('📌 ')
        ? currentName.slice(2).trimStart()
        : currentName.slice(2);
      await channel.setName(newName);
      await channel.edit({ position: 999 }).catch(() => {});
      await interaction.reply({ content: '📌 Ticket unpinned.', flags: MessageFlags.Ephemeral });
      await logTicketEvent(guild, 'unpin', {
        fields: [{ name: 'Ticket', value: `#${ticketNum}`, inline: true }],
      });
    } else {
      // Pin it.
      await channel.setName(`📌 ${currentName}`);
      await channel.edit({ position: 0 }).catch(() => {});
      await interaction.reply({ content: '📌 Ticket pinned.', flags: MessageFlags.Ephemeral });
      await logTicketEvent(guild, 'pin', {
        fields: [{ name: 'Ticket', value: `#${ticketNum}`, inline: true }],
      });
    }
  } catch (e) {
    logger.warn('[ticket:pin] channel rename failed:', e.message);
    // Still reply so the interaction doesn't time out.
    await replyEphemeral(interaction, '⚠️ Could not rename the channel (rate limited?), but the action was noted.');
  }
}

// ---------------------------------------------------------------------------
// setPriority
// ---------------------------------------------------------------------------

async function setPriority(interaction, level) {
  const { channelId, guildId, guild, member, channel } = interaction;

  if (!canManageTicket(member, guildId)) {
    return replyEphemeral(interaction, '⛔ Staff only.');
  }

  if (!PRIORITY[level]) {
    return replyEphemeral(interaction, `⚠️ Unknown priority level: ${level}`);
  }

  const ticket = getTicket(channelId);
  if (!ticket) return replyEphemeral(interaction, 'Not a ticket channel.');

  updateTicket(channelId, { priority: level });

  const p = PRIORITY[level];

  // Edit welcome embed — replace **Priority:** line in description and set color.
  const welcomeMsg = await fetchMessage(channel, ticket.welcomeMessageId);
  if (welcomeMsg?.embeds?.[0]) {
    try {
      const oldEmbed = welcomeMsg.embeds[0];
      const oldDesc = oldEmbed.description || '';
      const newDesc = oldDesc.replace(
        /\*\*Priority:\*\*.*/,
        `**Priority:** ${p.emoji} ${p.label}`,
      );
      const updatedEmbed = EmbedBuilder.from(oldEmbed)
        .setDescription(newDesc)
        .setColor(p.color);
      await welcomeMsg.edit({ embeds: [updatedEmbed] });
    } catch (e) {
      logger.warn('[ticket:setPriority] could not edit welcome msg:', e.message);
    }
  }

  // Post a status embed.
  const statusEmbed = new EmbedBuilder()
    .setTitle('Priority Updated')
    .setDescription(`📊 Priority set to **${p.emoji} ${p.label}** by <@${member.id}>`)
    .setColor(p.color);

  await channel.send({ embeds: [statusEmbed] }).catch(() => {});

  await interaction.reply({ content: '✅ Priority updated.', flags: MessageFlags.Ephemeral });

  const ticketNum = ticket.number || channel.name;
  await logTicketEvent(guild, 'priority', {
    fields: [
      { name: 'Ticket',     value: `#${ticketNum}`,     inline: true },
      { name: 'Priority',   value: `${p.emoji} ${p.label}`, inline: true },
      { name: 'Updated by', value: `<@${member.id}>`,   inline: true },
    ],
  });
}

// ---------------------------------------------------------------------------
// close
// ---------------------------------------------------------------------------

/**
 * Close a ticket.  The close reason has already been resolved by the caller
 * (either from the modal input or a default string).
 */
async function close(interaction, reason) {
  const { channelId, guildId, guild, member, channel } = interaction;

  const ticket = getTicket(channelId);
  if (!ticket) return replyEphemeral(interaction, 'Not a ticket channel.');

  if (!canCloseTicket(member, guildId, ticket)) {
    return replyEphemeral(interaction, "⛔ You can't close this ticket.");
  }

  const cfg = getConfig(guildId);

  // Persist closed state.
  updateTicket(channelId, {
    status: 'closed',
    closedBy: member.id,
    closedAt: Date.now(),
    closeReason: reason,
  });

  // Move to closed category if configured.
  if (cfg.closedCategoryId) {
    await channel.setParent(cfg.closedCategoryId, { lockPermissions: false }).catch(() => {});
  }

  // Revoke opener's access.
  await channel.permissionOverwrites
    .edit(ticket.userId, { ViewChannel: false, SendMessages: false })
    .catch(() => {});

  // Edit the welcome message — update Status field and color.
  const welcomeMsg = await fetchMessage(channel, ticket.welcomeMessageId);
  if (welcomeMsg?.embeds?.[0]) {
    try {
      const oldEmbed = welcomeMsg.embeds[0];
      const newFields = replaceField(oldEmbed.fields, 'Status', '🔴 Closed');
      const updatedEmbed = EmbedBuilder.from(oldEmbed)
        .setFields(newFields)
        .setColor(COLORS.closed);
      await welcomeMsg.edit({ embeds: [updatedEmbed], components: [] });
    } catch (e) {
      logger.warn('[ticket:close] could not edit welcome msg:', e.message);
    }
  }

  // Post close status embed.
  const dmLine = cfg.dmOnClose ? '\n\n📩 A DM has been sent to the ticket creator.' : '';
  const closeEmbed = new EmbedBuilder()
    .setTitle('Ticket Closed')
    .setDescription(
      `This ticket has been closed by <@${member.id}>.\n**Reason:** ${reason}${dmLine}`,
    )
    .setColor(COLORS.closed)
    .setFooter({ text: `Ticket ID: ${channelId}` });

  await channel.send({ embeds: [closeEmbed], components: [closedRow()] }).catch(() => {});

  // DM the opener if configured.
  if (cfg.dmOnClose) {
    try {
      const opener = await interaction.client.users.fetch(ticket.userId);
      const ticketNum = ticket.number || channel.name;
      const dmEmbed = new EmbedBuilder()
        .setTitle('🎫 Your Ticket Has Been Closed')
        .setDescription(
          `Your ticket **#${ticketNum}** has been closed.\n` +
          `**Reason:** ${reason}\n` +
          `**Closed by:** ${member.user.tag}`,
        )
        .setColor(COLORS.closed)
        .setFooter({ text: `Ticket ID: ${channelId}` });
      await opener.send({ embeds: [dmEmbed] });
      await require('./feedback').sendSurvey(opener, guildId, channelId);
    } catch {
      // DMs may be disabled — silently ignore.
    }
  }

  const ticketNum = ticket.number || channel.name;
  await logTicketEvent(guild, 'close', {
    fields: [
      { name: 'Ticket',    value: `#${ticketNum}`,        inline: true },
      { name: 'Closed by', value: `<@${member.id}>`,      inline: true },
      { name: 'Channel',   value: `<#${channelId}>`,      inline: true },
      { name: 'Reason',    value: reason.slice(0, 1000) },
    ],
  });

  await replyEphemeral(interaction, '🔒 Ticket closed.');
}

// ---------------------------------------------------------------------------
// reopen
// ---------------------------------------------------------------------------

async function reopen(interaction) {
  const { channelId, guildId, guild, member, channel } = interaction;

  const ticket = getTicket(channelId);
  if (!ticket) return replyEphemeral(interaction, 'Not a ticket channel.');

  if (!canManageTicket(member, guildId)) {
    return replyEphemeral(interaction, '⛔ Staff only.');
  }

  const cfg = getConfig(guildId);

  // Persist open state.
  updateTicket(channelId, {
    status: 'open',
    closedBy: null,
    closedAt: null,
    closeReason: null,
  });

  // Move back to open category if configured.
  if (cfg.categoryId) {
    await channel.setParent(cfg.categoryId, { lockPermissions: false }).catch(() => {});
  }

  // Restore opener's access.
  await channel.permissionOverwrites
    .edit(ticket.userId, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
      AttachFiles: true,
    })
    .catch(() => {});

  // Edit the welcome message — restore Status field and color.
  const welcomeMsg = await fetchMessage(channel, ticket.welcomeMessageId);
  if (welcomeMsg?.embeds?.[0]) {
    try {
      const oldEmbed = welcomeMsg.embeds[0];
      const newFields = replaceField(oldEmbed.fields, 'Status', '🟢 Open');
      const updatedEmbed = EmbedBuilder.from(oldEmbed)
        .setFields(newFields)
        .setColor(PRIORITY[ticket.priority || 'none'].color);
      await welcomeMsg.edit({
        embeds: [updatedEmbed],
        components: [controlRow({ claimed: !!ticket.claimedBy, enablePriority: cfg.enablePriority })],
      });
    } catch (e) {
      logger.warn('[ticket:reopen] could not edit welcome msg:', e.message);
    }
  }

  // Edit the message the button lives on (the close status embed).
  try {
    const reopenEmbed = new EmbedBuilder()
      .setTitle('Ticket Reopened')
      .setDescription(`🔓 <@${member.id}> has reopened this ticket!`)
      .setColor(COLORS.reopen);
    await interaction.message.edit({ embeds: [reopenEmbed], components: [] });
  } catch (e) {
    logger.warn('[ticket:reopen] could not edit close-status msg:', e.message);
  }

  const ticketNum = ticket.number || channel.name;
  await logTicketEvent(guild, 'reopen', {
    fields: [
      { name: 'Ticket',     value: `#${ticketNum}`,    inline: true },
      { name: 'Reopened by', value: `<@${member.id}>`, inline: true },
      { name: 'Channel',    value: `<#${channelId}>`,  inline: true },
    ],
  });

  await replyEphemeral(interaction, '🔓 Ticket reopened.');
}

// ---------------------------------------------------------------------------
// deleteTicket
// ---------------------------------------------------------------------------

async function deleteTicket(interaction) {
  const { channelId, guildId, guild, member, channel } = interaction;

  if (!canManageTicket(member, guildId)) {
    return replyEphemeral(interaction, '⛔ Staff only.');
  }

  const ticket = getTicket(channelId);
  const ticketNum = ticket?.number || channel.name;

  // Announce deletion in channel.
  const deleteEmbed = new EmbedBuilder()
    .setTitle('Ticket Deleted')
    .setDescription('🗑️ This ticket will be permanently deleted in 3 seconds.')
    .setColor(COLORS.closed)
    .setFooter({ text: `Ticket ID: ${channelId}` });

  await channel.send({ embeds: [deleteEmbed] });

  await replyEphemeral(interaction, '🗑️ Deleting in 3 seconds…');

  await logTicketEvent(guild, 'delete', {
    fields: [
      { name: 'Ticket',     value: `#${ticketNum}`,    inline: true },
      { name: 'Deleted by', value: `<@${member.id}>`,  inline: true },
    ],
  });

  const cfg = getConfig(guildId);

  setTimeout(async () => {
    try {
      const { buffer, filename } = await generateHtml(channel);

      if (cfg.transcriptChannelId) {
        const transcriptChannel = await guild.channels
          .fetch(cfg.transcriptChannelId)
          .catch(() => null);

        if (transcriptChannel) {
          const transcriptEmbed = new EmbedBuilder()
            .setTitle('Ticket Transcript')
            .addFields(
              { name: 'Ticket',    value: `#${ticketNum}`,                              inline: true },
              { name: 'Channel',   value: `#${channel.name}`,                           inline: true },
              { name: 'Generated', value: `<t:${Math.floor(Date.now() / 1000)}:F>`,     inline: true },
            )
            .setFooter({ text: `Deleted by ${member.user.tag}` })
            .setColor(0x3498DB);

          await transcriptChannel.send({
            embeds: [transcriptEmbed],
            files: [{ attachment: buffer, name: filename }],
          });
        }
      }

      await channel.delete().catch(() => {});
    } catch (e) {
      logger.error('[ticket:delete] error in timeout:', e.message);
    }
  }, 3000);
}

// ---------------------------------------------------------------------------

module.exports = { openTicket, claim, unclaim, pin, setPriority, close, reopen, deleteTicket, isTwoFactorError, TWO_FA_MSG };
