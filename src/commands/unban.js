// src/commands/unban.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const modlog = require('../core/modlog');
const logger = require('../core/logger');
const scheduler = require('../core/scheduler');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unban').setDescription('Lift a ban by user id')
    .addStringOption((o) => o.setName('user_id').setDescription('User id (snowflake)').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason')),
  async execute(interaction) {
    const userId = interaction.options.getString('user_id');
    const reason = interaction.options.getString('reason') || 'No reason given';

    // Validate the id is a Discord snowflake before hitting the API.
    if (!/^\d{17,20}$/.test(userId)) {
      return interaction.reply({ content: '⛔ That doesn’t look like a valid user id.', flags: MessageFlags.Ephemeral });
    }

    // Confirm the user is actually banned; fetch returns null if not.
    const ban = await interaction.guild.bans.fetch(userId).catch(() => null);
    if (!ban) {
      return interaction.reply({ content: 'That user isn’t banned.', flags: MessageFlags.Ephemeral });
    }

    try {
      await interaction.guild.members.unban(userId, `Unban by ${interaction.user.tag}: ${reason}`);

      // Cancel any pending tempban-lift so it can't fire after a manual unban.
      for (const j of scheduler.jobs()) {
        if (j.type === 'tempban-lift' && j.data.userId === userId && j.data.guildId === interaction.guild.id) {
          scheduler.cancel(j.id);
        }
      }

      await interaction.reply({ content: `✅ Unbanned <@${userId}> (\`${userId}\`).`, flags: MessageFlags.Ephemeral });
      await modlog.log(interaction.guild, { title: '✅ Unban', description: `**User:** ${ban.user.tag} (\`${userId}\`)\n**By:** ${interaction.user.tag}\n**Reason:** ${reason}`, color: 0x2ECC71 });
    } catch (e) {
      logger.error('[unban]', e.message);
      await interaction.reply({ content: `⚠️ Couldn't unban: ${e.message}`, flags: MessageFlags.Ephemeral });
    }
  },
};
