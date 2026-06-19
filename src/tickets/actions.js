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

const {
  getConfig, setConfig, nextCounter,
  getTicket, createTicket, updateTicket, openCount,
} = require('../core/ticketStore');
const { PRIORITY, COLORS, controlRow } = require('./constants');
const { isStaff, canManageTicket } = require('./permissions');
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

  const channel = await guild.channels.create({
    name: `ticket-${num}`,
    type: ChannelType.GuildText,
    parent: categoryId,
    permissionOverwrites,
  });

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
    const sent = await channel.send({ embeds: [claimEmbed], components: [unclaimRow] });
    updateTicket(channelId, { claimMsgId: sent.id });
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

  await channel.send({ embeds: [statusEmbed] });

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

module.exports = { openTicket, claim, unclaim, pin, setPriority };
