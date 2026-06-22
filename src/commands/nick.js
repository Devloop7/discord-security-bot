// src/commands/nick.js
const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const modlog = require('../core/modlog');
const logger = require('../core/logger');
const { checkActable } = require('../core/modguard');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('nick').setDescription("Set or reset a member's nickname")
    .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true))
    .addStringOption((o) => o.setName('nickname').setDescription('New nickname (leave empty to reset)')),
  async execute(interaction) {
    const userId = interaction.options.getUser('user').id;

    // Prefer the cached member; fall back to a live fetch for uncached members.
    let member = interaction.options.getMember('user');
    if (!member) member = await interaction.guild.members.fetch(userId).catch(() => null);

    // Reuse the hierarchy guard (also blocks owner — whose nick can't be changed anyway).
    const { ok, reason: guardReason } = checkActable({ interaction, target: member, action: 'rename' });
    if (!ok) {
      return interaction.reply({ content: `⛔ ${guardReason}`, flags: MessageFlags.Ephemeral });
    }

    // Need the Manage Nicknames permission to edit anyone's nick.
    if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageNicknames)) {
      return interaction.reply({ content: '⛔ I lack Manage Nicknames.', flags: MessageFlags.Ephemeral });
    }

    const nn = interaction.options.getString('nickname') || null; // null resets to username
    const reason = `Nick by ${interaction.user.tag}`;
    try {
      await member.setNickname(nn, reason);
      const msg = nn ? `✏️ Set ${member.user.tag}'s nickname to **${nn}**.` : `✏️ Reset ${member.user.tag}'s nickname.`;
      await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
      await modlog.log(interaction.guild, { title: '✏️ Nickname change', description: `**User:** ${member.user.tag}\n**By:** ${interaction.user.tag}\n**Nickname:** ${nn ? nn : '*(reset)*'}`, color: 0x1ABC9C });
    } catch (e) {
      logger.error('[nick]', e.message);
      await interaction.reply({ content: `⚠️ Couldn't set nickname: ${e.message}`, flags: MessageFlags.Ephemeral });
    }
  },
};
