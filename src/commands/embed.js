// src/commands/embed.js — /embed: post a rich embed as the bot (staff only)
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
} = require('discord.js');
const { isStaff } = require('../core/perms');
const { buildEmbed, checkSendPerms } = require('../embeds/build');
const modlog = require('../core/modlog');
const logger = require('../core/logger');

const data = new SlashCommandBuilder()
  .setName('embed')
  .setDescription('Post a rich embed as the bot (staff only)')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addStringOption((o) =>
    o.setName('description').setDescription('Embed body text (use \\n for line breaks)'),
  )
  .addStringOption((o) =>
    o.setName('title').setDescription('Embed title'),
  )
  .addChannelOption((o) =>
    o
      .setName('channel')
      .setDescription('Channel to post in (defaults to current channel)')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
  )
  .addStringOption((o) =>
    o.setName('color').setDescription('Hex color code, e.g. #5865F2'),
  )
  .addStringOption((o) =>
    o.setName('image').setDescription('Full image URL (https://)'),
  )
  .addStringOption((o) =>
    o.setName('thumbnail').setDescription('Full thumbnail URL (https://)'),
  )
  .addStringOption((o) =>
    o.setName('footer').setDescription('Footer text'),
  )
  .addStringOption((o) =>
    o.setName('author_name').setDescription('Author name shown above the title'),
  )
  .addStringOption((o) =>
    o
      .setName('ping')
      .setDescription('Ping to include with the embed')
      .addChoices(
        { name: 'None',      value: 'none'     },
        { name: '@everyone', value: 'everyone' },
        { name: '@here',     value: 'here'     },
      ),
  );

async function execute(interaction) {
  if (!isStaff(interaction.member, interaction.guildId)) {
    return interaction.reply({ content: '⛔ Staff only.', flags: MessageFlags.Ephemeral });
  }

  const opts = interaction.options;
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

  const channel = opts.getChannel('channel') ?? interaction.channel;
  const ping = opts.getString('ping') ?? 'none';
  const needMention = ping !== 'none';

  const missing = checkSendPerms(channel, interaction.guild.members.me, needMention);
  if (missing.length > 0) {
    return interaction.reply({
      content: `⛔ I'm missing permissions in <#${channel.id}>: **${missing.join(', ')}**`,
      flags: MessageFlags.Ephemeral,
    });
  }

  const content = ping === 'everyone' ? '@everyone' : ping === 'here' ? '@here' : undefined;

  try {
    const sent = await channel.send({
      content,
      embeds: [embed],
      allowedMentions: { parse: needMention ? ['everyone'] : [] },
    });

    await interaction.reply({
      content: `✅ Posted in <#${channel.id}>. [Jump](${sent.url})`,
      flags: MessageFlags.Ephemeral,
    });

    await modlog.log(interaction.guild, {
      title: '📢 Embed posted',
      description: `**By:** ${interaction.user.tag}\n**Channel:** <#${channel.id}>${embedOpts.title ? `\n**Title:** ${embedOpts.title}` : ''}`,
      color: 0x5865F2,
    });
  } catch (err) {
    logger.error('[embed:execute]', err.message);
    if (!interaction.replied && !interaction.deferred) {
      await interaction
        .reply({ content: '⚠️ Failed to post embed.', flags: MessageFlags.Ephemeral })
        .catch(() => {});
    } else {
      await interaction
        .followUp({ content: '⚠️ Failed to post embed.', flags: MessageFlags.Ephemeral })
        .catch(() => {});
    }
  }
}

module.exports = { data, execute, bypassModGate: true };
