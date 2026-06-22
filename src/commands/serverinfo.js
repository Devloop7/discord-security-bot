// src/commands/serverinfo.js — /serverinfo: show an overview of the current server.
// Public command: bypassModGate = true so the dispatcher skips the global isMod gate.
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ChannelType,
  MessageFlags,
} = require('discord.js');
const logger = require('../core/logger');

const BRAND = 0x5865F2;

// Map premiumTier enum -> human label.
const BOOST_TIERS = {
  0: 'None',
  1: 'Tier 1',
  2: 'Tier 2',
  3: 'Tier 3',
};

// Map verificationLevel enum -> human label.
const VERIFICATION_LEVELS = {
  0: 'None',
  1: 'Low',
  2: 'Medium',
  3: 'High',
  4: 'Highest',
};

const data = new SlashCommandBuilder()
  .setName('serverinfo')
  .setDescription('Show information about this server');

async function execute(interaction) {
  try {
    const guild = interaction.guild;

    // Member breakdown — the cache may be partial, so memberCount is the source
    // of truth for the total; humans/bots are best-effort from whatever is cached.
    const total = guild.memberCount;
    const cached = guild.members.cache;
    const bots = cached.filter((m) => m.user.bot).size;
    const humans = cached.size - bots;

    // Channel counts by type from the cache.
    const channels = guild.channels.cache;
    const textCount = channels.filter((c) =>
      c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement,
    ).size;
    const voiceCount = channels.filter((c) =>
      c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice,
    ).size;
    const categoryCount = channels.filter((c) => c.type === ChannelType.GuildCategory).size;

    const boostTier = BOOST_TIERS[guild.premiumTier] ?? String(guild.premiumTier);
    const boosts = guild.premiumSubscriptionCount ?? 0;
    const verification = VERIFICATION_LEVELS[guild.verificationLevel] ?? String(guild.verificationLevel);

    const createdSeconds = Math.floor(guild.createdTimestamp / 1000);

    const embed = new EmbedBuilder()
      .setColor(BRAND)
      .setTitle(guild.name)
      .setTimestamp()
      .addFields(
        { name: 'Server ID', value: guild.id, inline: true },
        { name: 'Owner', value: `<@${guild.ownerId}>`, inline: true },
        { name: 'Created', value: `<t:${createdSeconds}:F>`, inline: false },
        { name: 'Members', value: `${total} total\n${humans} humans · ${bots} bots`, inline: true },
        {
          name: 'Channels',
          value: `${textCount} text · ${voiceCount} voice · ${categoryCount} categories`,
          inline: true,
        },
        { name: 'Roles', value: String(guild.roles.cache.size), inline: true },
        { name: 'Emojis', value: String(guild.emojis.cache.size), inline: true },
        { name: 'Boosts', value: `${boostTier} (${boosts} boosts)`, inline: true },
        { name: 'Verification', value: verification, inline: true },
      );

    const icon = guild.iconURL();
    if (icon) embed.setThumbnail(icon);

    return interaction.reply({ embeds: [embed] });
  } catch (e) {
    logger.error('[serverinfo]', e.message);
    if (!interaction.replied && !interaction.deferred) {
      return interaction
        .reply({ content: '⚠️ Couldn\'t fetch server info.', flags: MessageFlags.Ephemeral })
        .catch(() => {});
    }
    return interaction
      .followUp({ content: '⚠️ Couldn\'t fetch server info.', flags: MessageFlags.Ephemeral })
      .catch(() => {});
  }
}

module.exports = { data, execute, bypassModGate: true };
