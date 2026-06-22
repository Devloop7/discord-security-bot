// src/commands/roleinfo.js — /roleinfo: show details about a role (public)
const {
  SlashCommandBuilder,
  MessageFlags,
  EmbedBuilder,
  PermissionsBitField,
} = require('discord.js');
const logger = require('../core/logger');

// Notable permissions worth surfacing, in priority order. Capped when rendered.
const NOTABLE_PERMS = [
  ['Administrator', 'Administrator'],
  ['ManageGuild', 'Manage Server'],
  ['ManageRoles', 'Manage Roles'],
  ['ManageChannels', 'Manage Channels'],
  ['ManageMessages', 'Manage Messages'],
  ['ManageWebhooks', 'Manage Webhooks'],
  ['ManageNicknames', 'Manage Nicknames'],
  ['ManageEmojisAndStickers', 'Manage Emojis & Stickers'],
  ['ManageEvents', 'Manage Events'],
  ['ManageThreads', 'Manage Threads'],
  ['KickMembers', 'Kick Members'],
  ['BanMembers', 'Ban Members'],
  ['ModerateMembers', 'Timeout Members'],
  ['MentionEveryone', 'Mention Everyone'],
  ['MuteMembers', 'Mute Members'],
  ['DeafenMembers', 'Deafen Members'],
  ['MoveMembers', 'Move Members'],
  ['ViewAuditLog', 'View Audit Log'],
  ['ViewGuildInsights', 'View Server Insights'],
];

const PERM_CAP = 12;
const yesNo = (v) => (v ? 'Yes' : 'No');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('roleinfo')
    .setDescription('Show details about a role')
    .addRoleOption((o) =>
      o.setName('role').setDescription('Role to inspect').setRequired(true),
    ),
  async execute(interaction) {
    try {
      const role = interaction.options.getRole('role');

      // Collect notable permissions this role actually grants, capped for length.
      const granted = NOTABLE_PERMS.filter(([flag]) =>
        role.permissions.has(PermissionsBitField.Flags[flag]),
      ).map(([, label]) => label);
      const shown = granted.slice(0, PERM_CAP);
      const extra = granted.length - shown.length;
      const permsValue = shown.length
        ? shown.join(', ') + (extra > 0 ? `, +${extra} more` : '')
        : '*None notable*';

      const hex = `#${role.color.toString(16).padStart(6, '0').toUpperCase()}`;
      const createdSec = Math.floor(role.createdTimestamp / 1000);

      const embed = new EmbedBuilder()
        .setColor(role.color || 0x99aab5)
        .setTitle(`🎭 ${role.name}`)
        .addFields(
          { name: 'ID', value: `\`${role.id}\``, inline: true },
          { name: 'Color', value: hex, inline: true },
          { name: 'Position', value: `${role.position}`, inline: true },
          { name: 'Members', value: `${role.members.size}`, inline: true },
          { name: 'Mentionable', value: yesNo(role.mentionable), inline: true },
          { name: 'Hoisted', value: yesNo(role.hoist), inline: true },
          { name: 'Managed', value: yesNo(role.managed), inline: true },
          { name: 'Created', value: `<t:${createdSec}:F>`, inline: false },
          { name: 'Key Permissions', value: permsValue, inline: false },
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } catch (e) {
      logger.error('[roleinfo]', e.message);
      return interaction.reply({
        content: '⚠️ Couldn\'t fetch role info.',
        flags: MessageFlags.Ephemeral,
      });
    }
  },
  bypassModGate: true,
};
