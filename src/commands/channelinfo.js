// src/commands/channelinfo.js — /channelinfo: show details about a channel (public)
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ChannelType,
  MessageFlags,
} = require('discord.js');
const logger = require('../core/logger');

const BRAND = 0x5865F2;

// Human-readable labels for the channel types we care about; falls back to the
// raw enum key for anything not listed here.
const TYPE_LABELS = {
  [ChannelType.GuildText]: 'Text',
  [ChannelType.GuildVoice]: 'Voice',
  [ChannelType.GuildCategory]: 'Category',
  [ChannelType.GuildAnnouncement]: 'Announcement',
  [ChannelType.AnnouncementThread]: 'Announcement Thread',
  [ChannelType.PublicThread]: 'Public Thread',
  [ChannelType.PrivateThread]: 'Private Thread',
  [ChannelType.GuildStageVoice]: 'Stage',
  [ChannelType.GuildForum]: 'Forum',
  [ChannelType.GuildMedia]: 'Media',
};

function typeLabel(type) {
  if (TYPE_LABELS[type]) return TYPE_LABELS[type];
  // Reverse-lookup the enum key (e.g. "GuildDirectory") for unmapped types.
  const key = Object.keys(ChannelType).find((k) => ChannelType[k] === type);
  return key || `Unknown (${type})`;
}

// Format slowmode seconds into a compact human string.
function formatSlowmode(seconds) {
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}h`;
  if (seconds >= 60) return `${Math.floor(seconds / 60)}m`;
  return `${seconds}s`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('channelinfo')
    .setDescription('Show information about a channel')
    .addChannelOption((o) =>
      o.setName('channel').setDescription('Channel to inspect (defaults to this channel)'),
    ),
  bypassModGate: true,
  async execute(interaction) {
    try {
      const channel = interaction.options.getChannel('channel') ?? interaction.channel;

      if (!channel) {
        return interaction.reply({
          content: '⚠️ Couldn\'t resolve that channel.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const embed = new EmbedBuilder()
        .setColor(BRAND)
        .setTitle(`📺 Channel: ${channel.name}`)
        .addFields(
          { name: 'Name', value: channel.name ?? 'Unknown', inline: true },
          { name: 'ID', value: channel.id, inline: true },
          { name: 'Type', value: typeLabel(channel.type), inline: true },
          { name: 'Mention', value: `<#${channel.id}>`, inline: true },
        )
        .setTimestamp();

      // Category parent (text/voice/etc. all expose parentId).
      if (channel.parent) {
        embed.addFields({ name: 'Category', value: channel.parent.name, inline: true });
      }

      // Topic only exists on text-like channels and may be empty/null.
      if (typeof channel.topic === 'string' && channel.topic.length > 0) {
        embed.addFields({ name: 'Topic', value: channel.topic.slice(0, 1024), inline: false });
      }

      // NSFW flag exists on text/voice/forum channels.
      if (typeof channel.nsfw === 'boolean') {
        embed.addFields({ name: 'NSFW', value: channel.nsfw ? 'Yes' : 'No', inline: true });
      }

      // Slowmode (rateLimitPerUser) — only show when actually set.
      if (typeof channel.rateLimitPerUser === 'number' && channel.rateLimitPerUser > 0) {
        embed.addFields({
          name: 'Slowmode',
          value: formatSlowmode(channel.rateLimitPerUser),
          inline: true,
        });
      }

      // Voice/stage channels expose a user limit and bitrate.
      if (channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice) {
        if (typeof channel.userLimit === 'number') {
          embed.addFields({
            name: 'User Limit',
            value: channel.userLimit > 0 ? String(channel.userLimit) : 'Unlimited',
            inline: true,
          });
        }
        if (typeof channel.bitrate === 'number') {
          embed.addFields({ name: 'Bitrate', value: `${Math.round(channel.bitrate / 1000)} kbps`, inline: true });
        }
      }

      // Creation date (DiscordTimestamp → Discord <t:..:F> long format).
      if (typeof channel.createdTimestamp === 'number') {
        const unix = Math.floor(channel.createdTimestamp / 1000);
        embed.addFields({ name: 'Created', value: `<t:${unix}:F>`, inline: false });
      }

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } catch (e) {
      logger.error('[channelinfo]', e.message);
      return interaction.reply({
        content: '⚠️ Something went wrong fetching that channel\'s info.',
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
    }
  },
};
