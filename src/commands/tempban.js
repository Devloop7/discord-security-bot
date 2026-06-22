// src/commands/tempban.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const modlog = require('../core/modlog');
const logger = require('../core/logger');
const scheduler = require('../core/scheduler');
const cases = require('../core/cases');
const { checkActable } = require('../core/modguard');
const { parseDuration } = require('../core/duration');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tempban').setDescription('Temporarily ban a user')
    .addUserOption((o) => o.setName('user').setDescription('User to ban').setRequired(true))
    .addStringOption((o) => o.setName('duration').setDescription('Duration, e.g. 1h, 2d, 1w').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason'))
    .addIntegerOption((o) => o.setName('delete_days').setDescription('Days of messages to delete (0–7)').setMinValue(0).setMaxValue(7)),
  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const durationStr = interaction.options.getString('duration');
    const reason = interaction.options.getString('reason') || 'No reason given';
    const deleteDays = interaction.options.getInteger('delete_days') ?? 0;

    // Parse duration; reject anything that isn't a positive m/h/d/w span.
    const ms = parseDuration(durationStr);
    if (ms <= 0) {
      return interaction.reply({ content: '⛔ Invalid duration. Use formats like `30m`, `1h`, `2d`, `1w`.', flags: MessageFlags.Ephemeral });
    }

    // Prefer the cached member; fall back to a live fetch. May be null if not in guild.
    let member = interaction.options.getMember('user');
    if (!member) member = await interaction.guild.members.fetch(user.id).catch(() => null);

    // Only run hierarchy checks when the target is actually in the guild.
    if (member) {
      const { ok, reason: guardReason } = checkActable({ interaction, target: member, action: 'ban' });
      if (!ok) {
        return interaction.reply({ content: `⛔ ${guardReason}`, flags: MessageFlags.Ephemeral });
      }
    }

    const runAt = Date.now() + ms;
    const liftTs = Math.floor(runAt / 1000); // Discord relative timestamp uses seconds.
    const auditReason = `Banned by ${interaction.user.tag}: ${reason}`;
    try {
      await interaction.guild.members.ban(user.id, { reason: auditReason, deleteMessageSeconds: deleteDays * 86_400 });
      scheduler.schedule('tempban-lift', runAt, { guildId: interaction.guild.id, userId: user.id });
      cases.add(user.id, { type: 'tempban', modId: interaction.user.id, reason });
      await interaction.reply({ content: `⛔ Temp-banned ${user.tag}. Lifts <t:${liftTs}:R>.`, flags: MessageFlags.Ephemeral });
      await modlog.log(interaction.guild, { title: '⛔ Temp ban', description: `**User:** ${user.tag}\n**By:** ${interaction.user.tag}\n**Length:** ${durationStr}\n**Lifts:** <t:${liftTs}:R>\n**Reason:** ${reason}`, color: 0xE74C3C });
    } catch (e) {
      logger.error('[tempban]', e.message);
      await interaction.reply({ content: `⚠️ Couldn't temp-ban: ${e.message}`, flags: MessageFlags.Ephemeral });
    }
  },
};
