// src/commands/userinfo.js — /userinfo: show account + member details for a user.
// bypassModGate = true: this is a public, read-only info command.
const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');
const logger = require('../core/logger');

const BRAND = 0x5865F2;

// Human-friendly labels for the key permissions we surface, in priority order.
const KEY_PERMS = [
  [PermissionFlagsBits.Administrator, 'Administrator'],
  [PermissionFlagsBits.ManageGuild, 'Manage Server'],
  [PermissionFlagsBits.ManageRoles, 'Manage Roles'],
  [PermissionFlagsBits.ManageChannels, 'Manage Channels'],
  [PermissionFlagsBits.ManageMessages, 'Manage Messages'],
  [PermissionFlagsBits.KickMembers, 'Kick Members'],
  [PermissionFlagsBits.BanMembers, 'Ban Members'],
  [PermissionFlagsBits.ModerateMembers, 'Timeout Members'],
  [PermissionFlagsBits.MentionEveryone, 'Mention Everyone'],
  [PermissionFlagsBits.ManageNicknames, 'Manage Nicknames'],
  [PermissionFlagsBits.ManageWebhooks, 'Manage Webhooks'],
];

// Discord timestamp helpers (seconds since epoch).
function ts(date, style) {
  return `<t:${Math.floor(date.getTime() / 1000)}:${style}>`;
}

const data = new SlashCommandBuilder()
  .setName('userinfo')
  .setDescription('Show account and server details for a user')
  .addUserOption((o) =>
    o.setName('user').setDescription('User to look up (defaults to you)'),
  );

async function execute(interaction) {
  try {
    const user = interaction.options.getUser('user') || interaction.user;

    // Resolve a guild member; may be null if the user isn't in this server.
    let member = interaction.options.getMember('user');
    if (!member && user.id === interaction.user.id) member = interaction.member;
    if (!member && interaction.guild) {
      member = await interaction.guild.members.fetch(user.id).catch(() => null);
    }

    const color = member?.displayColor || BRAND;

    const embed = new EmbedBuilder()
      .setColor(color)
      .setAuthor({ name: user.tag })
      .setThumbnail(user.displayAvatarURL())
      .addFields(
        { name: 'User', value: `${user} \`${user.tag}\``, inline: false },
        { name: 'ID', value: `\`${user.id}\``, inline: true },
        { name: 'Bot', value: user.bot ? 'Yes' : 'No', inline: true },
        {
          name: 'Account Created',
          value: `${ts(user.createdAt, 'F')} (${ts(user.createdAt, 'R')})`,
          inline: false,
        },
      )
      .setTimestamp();

    if (member) {
      if (member.joinedAt) {
        embed.addFields({
          name: 'Joined Server',
          value: `${ts(member.joinedAt, 'F')} (${ts(member.joinedAt, 'R')})`,
          inline: false,
        });
      }

      // Roles excluding @everyone.
      const roles = member.roles.cache.filter((r) => r.id !== interaction.guild.id);
      embed.addFields(
        {
          name: 'Top Role',
          value: member.roles.highest && member.roles.highest.id !== interaction.guild.id
            ? `${member.roles.highest}`
            : 'None',
          inline: true,
        },
        { name: 'Role Count', value: `${roles.size}`, inline: true },
      );

      // Key permissions summary.
      const perms = member.permissions;
      const keyNames = perms.has(PermissionFlagsBits.Administrator)
        ? ['Administrator']
        : KEY_PERMS.filter(([flag]) => perms.has(flag)).map(([, label]) => label);
      embed.addFields({
        name: 'Key Permissions',
        value: keyNames.length ? keyNames.join(', ') : 'None',
        inline: false,
      });

      if (member.premiumSince) {
        embed.addFields({
          name: 'Boosting Since',
          value: `${ts(member.premiumSince, 'F')} (${ts(member.premiumSince, 'R')})`,
          inline: false,
        });
      }
    } else {
      embed.setFooter({ text: 'This user is not a member of this server.' });
    }

    return interaction.reply({ embeds: [embed] });
  } catch (e) {
    logger.error('[userinfo]', e.message);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      return interaction
        .reply({ content: '⚠️ Couldn\'t fetch that user.', flags: MessageFlags.Ephemeral })
        .catch(() => {});
    }
  }
}

module.exports = { data, execute, bypassModGate: true };
