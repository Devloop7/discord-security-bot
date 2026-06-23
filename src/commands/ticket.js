// src/commands/ticket.js — /ticket setup | config | close | claim | priority
// bypassModGate = true: the dispatcher (wired in Chunk 5) skips the global isMod gate
// for this command; permission is enforced here instead (per subcommand).
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
} = require('discord.js');
const { getConfig, setConfig, getTicket } = require('../core/ticketStore');
const { postPanel, buildPanelEmbed } = require('../tickets/panel');
const { panelComponents } = require('../tickets/constants');
const logger = require('../core/logger');

const data = new SlashCommandBuilder()
  .setName('ticket')
  .setDescription('Ticket system configuration')
  // ── setup ────────────────────────────────────────────────────────────────
  .addSubcommand((sub) =>
    sub
      .setName('setup')
      .setDescription('Initial ticket system setup — posts the panel')
      .addChannelOption((o) =>
        o
          .setName('panel_channel')
          .setDescription('Channel where the ticket panel will be posted')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true),
      )
      .addStringOption((o) =>
        o
          .setName('panel_message')
          .setDescription('Message shown on the ticket panel embed')
          .setRequired(true),
      )
      .addStringOption((o) =>
        o.setName('button_label').setDescription('Label for the Create Ticket button'),
      )
      .addChannelOption((o) =>
        o
          .setName('category')
          .setDescription('Category for open ticket channels')
          .addChannelTypes(ChannelType.GuildCategory),
      )
      .addChannelOption((o) =>
        o
          .setName('closed_category')
          .setDescription('Category for closed ticket channels')
          .addChannelTypes(ChannelType.GuildCategory),
      )
      .addRoleOption((o) =>
        o.setName('staff_role').setDescription('Role that can manage tickets'),
      )
      .addChannelOption((o) =>
        o
          .setName('log_channel')
          .setDescription('Channel for ticket event logs')
          .addChannelTypes(ChannelType.GuildText),
      )
      .addChannelOption((o) =>
        o
          .setName('transcript_channel')
          .setDescription('Channel where transcripts are posted after deletion')
          .addChannelTypes(ChannelType.GuildText),
      )
      .addIntegerOption((o) =>
        o
          .setName('max_tickets')
          .setDescription('Max open tickets per user (1-10, default 3)')
          .setMinValue(1)
          .setMaxValue(10),
      )
      .addBooleanOption((o) =>
        o.setName('dm_on_close').setDescription('DM user when their ticket is closed'),
      )
      .addBooleanOption((o) =>
        o.setName('enable_priority').setDescription('Show priority buttons on tickets'),
      ),
  )
  // ── config ───────────────────────────────────────────────────────────────
  .addSubcommand((sub) =>
    sub
      .setName('config')
      .setDescription('Update ticket system settings (all options optional)')
      .addChannelOption((o) =>
        o
          .setName('panel_channel')
          .setDescription('Move panel to a different channel')
          .addChannelTypes(ChannelType.GuildText),
      )
      .addStringOption((o) =>
        o.setName('panel_message').setDescription('Update the panel embed message'),
      )
      .addStringOption((o) =>
        o.setName('button_label').setDescription('Update the Create Ticket button label'),
      )
      .addChannelOption((o) =>
        o
          .setName('category')
          .setDescription('Category for open ticket channels')
          .addChannelTypes(ChannelType.GuildCategory),
      )
      .addChannelOption((o) =>
        o
          .setName('closed_category')
          .setDescription('Category for closed ticket channels')
          .addChannelTypes(ChannelType.GuildCategory),
      )
      .addRoleOption((o) =>
        o.setName('staff_role').setDescription('Role that can manage tickets'),
      )
      .addChannelOption((o) =>
        o
          .setName('log_channel')
          .setDescription('Channel for ticket event logs')
          .addChannelTypes(ChannelType.GuildText),
      )
      .addChannelOption((o) =>
        o
          .setName('transcript_channel')
          .setDescription('Channel where transcripts are posted after deletion')
          .addChannelTypes(ChannelType.GuildText),
      )
      .addIntegerOption((o) =>
        o
          .setName('max_tickets')
          .setDescription('Max open tickets per user (1-10)')
          .setMinValue(1)
          .setMaxValue(10),
      )
      .addBooleanOption((o) =>
        o.setName('dm_on_close').setDescription('DM user when their ticket is closed'),
      )
      .addBooleanOption((o) =>
        o.setName('enable_priority').setDescription('Show priority buttons on tickets'),
      ),
  )
  // ── quicksetup ───────────────────────────────────────────────────────────
  .addSubcommand((sub) =>
    sub
      .setName('quicksetup')
      .setDescription('One-command ticket setup — auto-creates category, log channel, and posts the panel')
      .addRoleOption((o) =>
        o.setName('staff_role').setDescription('Role that can see and manage tickets'),
      )
      .addChannelOption((o) =>
        o
          .setName('panel_channel')
          .setDescription('Channel where the panel will be posted (default: this channel)')
          .addChannelTypes(ChannelType.GuildText),
      ),
  )
  // ── close ────────────────────────────────────────────────────────────────
  .addSubcommand((sub) =>
    sub
      .setName('close')
      .setDescription('Close the current ticket channel')
      .addStringOption((o) =>
        o.setName('reason').setDescription('Reason for closing (optional)'),
      ),
  )
  // ── claim ────────────────────────────────────────────────────────────────
  .addSubcommand((sub) =>
    sub
      .setName('claim')
      .setDescription('Claim this ticket as yours to handle'),
  )
  // ── priority ─────────────────────────────────────────────────────────────
  .addSubcommand((sub) =>
    sub
      .setName('priority')
      .setDescription('Set the priority level for this ticket')
      .addStringOption((o) =>
        o
          .setName('level')
          .setDescription('Priority level')
          .setRequired(true)
          .addChoices(
            { name: 'Urgent', value: 'urgent' },
            { name: 'High',   value: 'high'   },
            { name: 'Medium', value: 'medium' },
            { name: 'Low',    value: 'low'    },
            { name: 'None',   value: 'none'   },
          ),
      ),
  );

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  // close / claim / priority — must be inside a ticket channel; actions enforce own perms.
  if (sub === 'close' || sub === 'claim' || sub === 'priority') {
    const ticket = getTicket(interaction.channelId);
    if (!ticket) {
      return interaction.reply({
        content: '⚠️ Use this inside a ticket channel.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const actions = require('../tickets/actions');
    try {
      if (sub === 'close') {
        const reason =
          interaction.options.getString('reason') ||
          'Closed via command without a specific reason.';
        return await actions.close(interaction, reason);
      }
      if (sub === 'claim')    return await actions.claim(interaction);
      if (sub === 'priority') return await actions.setPriority(interaction, interaction.options.getString('level'));
    } catch (err) {
      logger.error('[ticket:command]', err.message);
      if (!interaction.replied && !interaction.deferred) {
        await interaction
          .reply({ content: '⚠️ Ticket command failed.', flags: MessageFlags.Ephemeral })
          .catch(() => {});
      } else {
        await interaction
          .followUp({ content: '⚠️ Ticket command failed.', flags: MessageFlags.Ephemeral })
          .catch(() => {});
      }
    }
    return;
  }

  // setup / config — ManageGuild OR ManageChannels required.
  const { member } = interaction;
  const hasPerms =
    member.permissions.has(PermissionFlagsBits.ManageGuild) ||
    member.permissions.has(PermissionFlagsBits.ManageChannels);

  if (!hasPerms) {
    return interaction.reply({
      content: '⛔ You need Manage Server to configure tickets.',
      flags: MessageFlags.Ephemeral,
    });
  }

  try {
    if (sub === 'setup')      return await handleSetup(interaction);
    if (sub === 'config')     return await handleConfig(interaction);
    if (sub === 'quicksetup') return await handleQuickSetup(interaction);
  } catch (err) {
    logger.error('[ticket:command]', err.message);
    if (!interaction.replied && !interaction.deferred) {
      await interaction
        .reply({ content: '⚠️ Ticket command failed.', flags: MessageFlags.Ephemeral })
        .catch(() => {});
    } else {
      await interaction
        .followUp({ content: '⚠️ Ticket command failed.', flags: MessageFlags.Ephemeral })
        .catch(() => {});
    }
  }
}

// ── /ticket setup ─────────────────────────────────────────────────────────

async function handleSetup(interaction) {
  const opts = interaction.options;
  const guildId = interaction.guildId;
  const guild = interaction.guild;

  const panelChannel = opts.getChannel('panel_channel');
  const panelMessage = opts.getString('panel_message');
  const buttonLabel  = opts.getString('button_label')       ?? undefined;
  const category     = opts.getChannel('category')          ?? undefined;
  const closedCat    = opts.getChannel('closed_category')   ?? undefined;
  const staffRole    = opts.getRole('staff_role')            ?? undefined;
  const logChannel   = opts.getChannel('log_channel')       ?? undefined;
  const transcriptCh = opts.getChannel('transcript_channel') ?? undefined;
  const maxTickets   = opts.getInteger('max_tickets')        ?? undefined;
  const dmOnClose    = opts.getBoolean('dm_on_close')        ?? undefined;
  const enablePrio   = opts.getBoolean('enable_priority')    ?? undefined;

  // Build patch — only include explicitly provided values.
  const patch = {
    panelMessage,
    panelChannelId: panelChannel.id,
  };

  if (buttonLabel   !== undefined) patch.buttonLabel          = buttonLabel;
  if (closedCat     !== undefined) patch.closedCategoryId     = closedCat.id;
  if (staffRole     !== undefined) patch.staffRoleId          = staffRole.id;
  if (logChannel    !== undefined) patch.logChannelId         = logChannel.id;
  if (transcriptCh  !== undefined) patch.transcriptChannelId  = transcriptCh.id;
  if (maxTickets    !== undefined) patch.maxTicketsPerUser     = maxTickets;
  if (dmOnClose     !== undefined) patch.dmOnClose            = dmOnClose;
  if (enablePrio    !== undefined) patch.enablePriority       = enablePrio;

  // Resolve or auto-create ticket category.
  let categoryId;
  if (category !== undefined) {
    categoryId = category.id;
  } else {
    const existingCfg = getConfig(guildId);
    if (existingCfg.categoryId) {
      categoryId = existingCfg.categoryId;
    } else {
      // Auto-create a "Tickets" category with @everyone denied ViewChannel.
      const created = await guild.channels.create({
        name: 'Tickets',
        type: ChannelType.GuildCategory,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel],
          },
        ],
      });
      categoryId = created.id;
    }
  }
  patch.categoryId = categoryId;

  // Save config.
  setConfig(guildId, patch);

  // Post panel.
  const cfg = getConfig(guildId);
  const panelMsg = await postPanel(panelChannel, cfg);

  // Store panel message location.
  setConfig(guildId, {
    panelChannelId: panelChannel.id,
    panelMessageId: panelMsg.id,
  });

  // Build summary lines.
  const lines = [
    `✅ Ticket system configured!`,
    `• Panel channel: <#${panelChannel.id}>`,
    `• Panel message: "${panelMessage}"`,
    `• Ticket category: <#${categoryId}>`,
  ];
  if (buttonLabel)    lines.push(`• Button label: "${buttonLabel}"`);
  if (closedCat)      lines.push(`• Closed category: <#${closedCat.id}>`);
  if (staffRole)      lines.push(`• Staff role: <@&${staffRole.id}>`);
  if (logChannel)     lines.push(`• Log channel: <#${logChannel.id}>`);
  if (transcriptCh)   lines.push(`• Transcript channel: <#${transcriptCh.id}>`);
  if (maxTickets !== undefined) lines.push(`• Max tickets per user: ${maxTickets}`);
  if (dmOnClose !== undefined)  lines.push(`• DM on close: ${dmOnClose}`);
  if (enablePrio !== undefined)  lines.push(`• Priority buttons: ${enablePrio}`);
  lines.push(`• Panel: https://discord.com/channels/${guildId}/${panelChannel.id}/${panelMsg.id}`);

  return interaction.reply({
    content: lines.join('\n'),
    flags: MessageFlags.Ephemeral,
  });
}

// ── /ticket config ────────────────────────────────────────────────────────

async function handleConfig(interaction) {
  const opts = interaction.options;
  const guildId = interaction.guildId;

  const panelChannel = opts.getChannel('panel_channel')        ?? undefined;
  const panelMessage = opts.getString('panel_message')         ?? undefined;
  const buttonLabel  = opts.getString('button_label')          ?? undefined;
  const category     = opts.getChannel('category')             ?? undefined;
  const closedCat    = opts.getChannel('closed_category')      ?? undefined;
  const staffRole    = opts.getRole('staff_role')               ?? undefined;
  const logChannel   = opts.getChannel('log_channel')          ?? undefined;
  const transcriptCh = opts.getChannel('transcript_channel')   ?? undefined;
  const maxTickets   = opts.getInteger('max_tickets')           ?? undefined;
  const dmOnClose    = opts.getBoolean('dm_on_close')           ?? undefined;
  const enablePrio   = opts.getBoolean('enable_priority')       ?? undefined;

  // Build patch from only provided options.
  const patch = {};
  const changed = [];

  if (panelChannel  !== undefined) { patch.panelChannelId        = panelChannel.id;  changed.push(`panel_channel → <#${panelChannel.id}>`); }
  if (panelMessage  !== undefined) { patch.panelMessage          = panelMessage;      changed.push(`panel_message → "${panelMessage}"`); }
  if (buttonLabel   !== undefined) { patch.buttonLabel           = buttonLabel;       changed.push(`button_label → "${buttonLabel}"`); }
  if (category      !== undefined) { patch.categoryId            = category.id;       changed.push(`category → <#${category.id}>`); }
  if (closedCat     !== undefined) { patch.closedCategoryId      = closedCat.id;      changed.push(`closed_category → <#${closedCat.id}>`); }
  if (staffRole     !== undefined) { patch.staffRoleId           = staffRole.id;      changed.push(`staff_role → <@&${staffRole.id}>`); }
  if (logChannel    !== undefined) { patch.logChannelId          = logChannel.id;     changed.push(`log_channel → <#${logChannel.id}>`); }
  if (transcriptCh  !== undefined) { patch.transcriptChannelId   = transcriptCh.id;   changed.push(`transcript_channel → <#${transcriptCh.id}>`); }
  if (maxTickets    !== undefined) { patch.maxTicketsPerUser      = maxTickets;        changed.push(`max_tickets → ${maxTickets}`); }
  if (dmOnClose     !== undefined) { patch.dmOnClose             = dmOnClose;         changed.push(`dm_on_close → ${dmOnClose}`); }
  if (enablePrio    !== undefined) { patch.enablePriority        = enablePrio;        changed.push(`enable_priority → ${enablePrio}`); }

  if (changed.length === 0) {
    return interaction.reply({
      content: 'Nothing to change.',
      flags: MessageFlags.Ephemeral,
    });
  }

  setConfig(guildId, patch);
  const cfg = getConfig(guildId);

  // If panel_message or button_label changed, and a panel message exists → edit it.
  const panelAffected = panelMessage !== undefined || buttonLabel !== undefined;
  if (panelAffected && cfg.panelChannelId && cfg.panelMessageId) {
    try {
      const pCh = interaction.guild.channels.cache.get(cfg.panelChannelId)
        ?? await interaction.guild.channels.fetch(cfg.panelChannelId).catch(() => null);
      if (pCh) {
        const pMsg = await pCh.messages.fetch(cfg.panelMessageId).catch(() => null);
        if (pMsg) {
          const { buildPanelEmbed: bpe } = require('../tickets/panel');
          await pMsg.edit({
            embeds: [bpe(pCh, cfg)],
            components: panelComponents(cfg.buttonLabel),
          });
        }
      }
    } catch (e) {
      logger.error('[ticket:config] panel edit failed:', e.message);
    }
  }

  return interaction.reply({
    content: `✅ Updated:\n• ${changed.join('\n• ')}`,
    flags: MessageFlags.Ephemeral,
  });
}

// ── /ticket quicksetup ────────────────────────────────────────────────────

async function handleQuickSetup(interaction) {
  const { guild, guildId, channel: invocationChannel } = interaction;
  const opts = interaction.options;

  const staffRole    = opts.getRole('staff_role')      ?? undefined;
  const panelChannel = opts.getChannel('panel_channel') ?? invocationChannel;

  // ── Bot permission preflight ─────────────────────────────────────────────
  const botMember = interaction.guild.members.me;
  const required  = [
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
  ];
  const missing = required.filter((p) => !botMember.permissions.has(p));

  if (missing.length > 0) {
    const names = {
      [String(PermissionFlagsBits.ManageChannels)]: 'Manage Channels',
      [String(PermissionFlagsBits.ManageRoles)]:    'Manage Roles',
      [String(PermissionFlagsBits.ViewChannel)]:    'View Channel',
      [String(PermissionFlagsBits.SendMessages)]:   'Send Messages',
    };
    const list = missing.map((p) => names[String(p)] || String(p)).join(', ');
    return interaction.reply({
      content: `⚠️ I'm missing permissions: **${list}**. Re-invite me with the full permissions link.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  try {
    // ── Resolve or auto-create the ticket category ─────────────────────────
    let categoryId;
    const existingCfg = getConfig(guildId);

    if (existingCfg.categoryId) {
      categoryId = existingCfg.categoryId;
    } else {
      const found = guild.channels.cache.find(
        (c) =>
          c.type === ChannelType.GuildCategory &&
          c.name.toLowerCase().includes('tickets'),
      );

      if (found) {
        categoryId = found.id;
      } else {
        const created = await guild.channels.create({
          name: 'Tickets',
          type: ChannelType.GuildCategory,
          permissionOverwrites: [
            {
              id: guild.roles.everyone.id,
              deny: [PermissionFlagsBits.ViewChannel],
            },
          ],
        });
        categoryId = created.id;
      }
    }

    setConfig(guildId, { categoryId });

    // ── Auto-create ticket-logs if no logChannelId configured yet ──────────
    let logChannelId = existingCfg.logChannelId || null;

    if (!logChannelId) {
      try {
        const logOverwrites = [
          {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel],
          },
        ];
        if (staffRole) {
          logOverwrites.push({
            id: staffRole.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
            ],
          });
        }
        const logCh = await guild.channels.create({
          name: 'ticket-logs',
          type: ChannelType.GuildText,
          parent: categoryId,
          permissionOverwrites: logOverwrites,
        });
        logChannelId = logCh.id;
      } catch (e) {
        logger.error('[ticket:quicksetup] could not create log channel:', e.message);
        // Continue without logs — don't abort.
      }
    }

    // ── Build default config patch (only fill in unset values) ────────────
    const patch = { categoryId };

    if (logChannelId) {
      patch.logChannelId = logChannelId;
      if (!existingCfg.transcriptChannelId) patch.transcriptChannelId = logChannelId;
    }

    if (!existingCfg.panelMessage) {
      patch.panelMessage =
        'Need help or want to open a request? Click the button below and a private ticket will be created for you. Our staff will assist you shortly.';
    }
    if (!existingCfg.buttonLabel || existingCfg.buttonLabel === 'Create Ticket') {
      patch.buttonLabel = 'Create Ticket';
    }
    if (staffRole) patch.staffRoleId = staffRole.id;
    if (existingCfg.enablePriority === undefined || existingCfg.enablePriority === null) {
      patch.enablePriority = true;
    }
    if (existingCfg.dmOnClose === undefined || existingCfg.dmOnClose === null) {
      patch.dmOnClose = true;
    }
    if (!existingCfg.maxTicketsPerUser) {
      patch.maxTicketsPerUser = 3;
    }

    setConfig(guildId, patch);

    // ── Post panel ─────────────────────────────────────────────────────────
    const cfg = getConfig(guildId);
    const panelMsg = await postPanel(panelChannel, cfg);

    setConfig(guildId, {
      panelChannelId: panelChannel.id,
      panelMessageId: panelMsg.id,
    });

    // ── Reply ──────────────────────────────────────────────────────────────
    const jumpLink = `https://discord.com/channels/${guildId}/${panelChannel.id}/${panelMsg.id}`;
    return interaction.reply({
      content:
        `✅ Tickets ready! Panel posted in <#${panelChannel.id}>. ` +
        `Click **Create Ticket** to test — a private channel will open.\n` +
        `[Jump to panel](${jumpLink})`,
      flags: MessageFlags.Ephemeral,
    });

  } catch (err) {
    logger.error('[ticket:quicksetup]', err.message);
    const { isTwoFactorError, TWO_FA_MSG } = require('../tickets/actions');
    if (isTwoFactorError(err)) {
      return interaction.reply({ content: TWO_FA_MSG, flags: MessageFlags.Ephemeral });
    }
    return interaction.reply({
      content: `⚠️ Quick setup failed: ${err.message}`,
      flags: MessageFlags.Ephemeral,
    });
  }
}

module.exports = { data, execute, bypassModGate: true };
