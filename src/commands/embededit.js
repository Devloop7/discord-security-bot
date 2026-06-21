// src/commands/embededit.js — /embededit: edit an existing bot embed (staff only)
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
} = require('discord.js');
const { isStaff } = require('../core/perms');
const { buildEmbed } = require('../embeds/build');
const modlog = require('../core/modlog');
const logger = require('../core/logger');

const data = new SlashCommandBuilder()
  .setName('embededit')
  .setDescription("Edit an existing bot embed in a channel (staff only)")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addChannelOption((o) =>
    o
      .setName('channel')
      .setDescription('Channel that contains the message')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setRequired(true),
  )
  .addStringOption((o) =>
    o
      .setName('message_id')
      .setDescription('ID of the message to edit')
      .setRequired(true),
  )
  .addStringOption((o) =>
    o.setName('title').setDescription('New embed title'),
  )
  .addStringOption((o) =>
    o.setName('description').setDescription('New embed body text (use \\n for line breaks)'),
  )
  .addStringOption((o) =>
    o.setName('color').setDescription('New hex color code, e.g. #5865F2'),
  )
  .addStringOption((o) =>
    o.setName('image').setDescription('New full image URL (https://)'),
  )
  .addStringOption((o) =>
    o.setName('thumbnail').setDescription('New full thumbnail URL (https://)'),
  )
  .addStringOption((o) =>
    o.setName('footer').setDescription('New footer text'),
  )
  .addStringOption((o) =>
    o.setName('author_name').setDescription('New author name shown above the title'),
  );

async function execute(interaction) {
  if (!isStaff(interaction.member, interaction.guildId)) {
    return interaction.reply({ content: '⛔ Staff only.', flags: MessageFlags.Ephemeral });
  }

  const opts = interaction.options;
  const channel = opts.getChannel('channel', true);
  const messageId = opts.getString('message_id', true);

  // Fetch the target message.
  const msg = await channel.messages.fetch(messageId).catch(() => null);
  if (!msg) {
    return interaction.reply({
      content: '⛔ Message not found in that channel.',
      flags: MessageFlags.Ephemeral,
    });
  }

  if (msg.author.id !== interaction.client.user.id) {
    return interaction.reply({
      content: '⛔ I can only edit my own messages.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const embedOpts = {
    title:       opts.getString('title')       ?? undefined,
    description: opts.getString('description') ?? undefined,
    color:       opts.getString('color')       ?? undefined,
    image:       opts.getString('image')       ?? undefined,
    thumbnail:   opts.getString('thumbnail')   ?? undefined,
    footer:      opts.getString('footer')      ?? undefined,
    author_name: opts.getString('author_name') ?? undefined,
  };

  const { embed, error } = buildEmbed(embedOpts);
  if (error) {
    return interaction.reply({ content: `⛔ ${error}`, flags: MessageFlags.Ephemeral });
  }

  try {
    await msg.edit({ embeds: [embed] });

    await interaction.reply({
      content: `✅ Edited. [Jump](${msg.url})`,
      flags: MessageFlags.Ephemeral,
    });

    await modlog.log(interaction.guild, {
      title: '✏️ Embed edited',
      description: `**By:** ${interaction.user.tag}\n**Channel:** <#${channel.id}>\n**Message:** [Jump](${msg.url})${embedOpts.title ? `\n**New Title:** ${embedOpts.title}` : ''}`,
      color: 0xF39C12,
    });
  } catch (err) {
    logger.error('[embededit:execute]', err.message);
    if (!interaction.replied && !interaction.deferred) {
      await interaction
        .reply({ content: '⚠️ Failed to edit message.', flags: MessageFlags.Ephemeral })
        .catch(() => {});
    } else {
      await interaction
        .followUp({ content: '⚠️ Failed to edit message.', flags: MessageFlags.Ephemeral })
        .catch(() => {});
    }
  }
}

module.exports = { data, execute, bypassModGate: true };
