// src/commands/role.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const modlog = require('../core/modlog');
const logger = require('../core/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('role').setDescription('Add or remove a role from a member')
    .addSubcommand((s) => s.setName('add').setDescription('Add a role to a member')
      .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))
      .addRoleOption((o) => o.setName('role').setDescription('Role to add').setRequired(true)))
    .addSubcommand((s) => s.setName('remove').setDescription('Remove a role from a member')
      .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))
      .addRoleOption((o) => o.setName('role').setDescription('Role to remove').setRequired(true))),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const role = interaction.options.getRole('role');
    const userId = interaction.options.getUser('user').id;

    // Prefer the cached member; fall back to a live fetch for uncached members.
    let member = interaction.options.getMember('user');
    if (!member) member = await interaction.guild.members.fetch(userId).catch(() => null);
    if (!member) {
      return interaction.reply({ content: `⛔ That user isn't in this server.`, flags: MessageFlags.Ephemeral });
    }

    // Role-hierarchy checks (modguard guards member actions, not role edits — do these inline).
    const guild = interaction.guild;
    const me = guild.members.me;
    if (me.roles.highest.comparePositionTo(role) <= 0) {
      return interaction.reply({ content: `⛔ My role must be above ${role.name}.`, flags: MessageFlags.Ephemeral });
    }
    if (role.managed) {
      return interaction.reply({ content: `⛔ That role is managed by an integration.`, flags: MessageFlags.Ephemeral });
    }
    if (interaction.user.id !== guild.ownerId && interaction.member.roles.highest.comparePositionTo(role) <= 0) {
      return interaction.reply({ content: `⛔ You can't manage a role equal/higher than your top role.`, flags: MessageFlags.Ephemeral });
    }

    const auditReason = `Role ${sub} by ${interaction.user.tag}`;
    try {
      if (sub === 'add') {
        if (member.roles.cache.has(role.id)) {
          return interaction.reply({ content: `Already has that role.`, flags: MessageFlags.Ephemeral });
        }
        await member.roles.add(role, auditReason);
        await interaction.reply({ content: `✅ Added ${role.name} to ${member.user.tag}.`, flags: MessageFlags.Ephemeral });
        await modlog.log(guild, { title: '🎭 Role added', description: `**User:** ${member.user.tag}\n**Role:** ${role.name}\n**By:** ${interaction.user.tag}`, color: 0x9B59B6 });
      } else {
        if (!member.roles.cache.has(role.id)) {
          return interaction.reply({ content: `Doesn't have that role.`, flags: MessageFlags.Ephemeral });
        }
        await member.roles.remove(role, auditReason);
        await interaction.reply({ content: `✅ Removed ${role.name} from ${member.user.tag}.`, flags: MessageFlags.Ephemeral });
        await modlog.log(guild, { title: '🎭 Role removed', description: `**User:** ${member.user.tag}\n**Role:** ${role.name}\n**By:** ${interaction.user.tag}`, color: 0x9B59B6 });
      }
    } catch (e) {
      logger.error('[role]', e.message);
      await interaction.reply({ content: `⚠️ Couldn't ${sub} role: ${e.message}`, flags: MessageFlags.Ephemeral });
    }
  },
};
