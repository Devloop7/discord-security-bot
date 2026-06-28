// src/commands/vouches.js — /vouches panel | stats | recent | setup | remove
// Public command (bypassModGate); panel/setup/remove self-gate via isStaff.
// All embeds use src/ui/theme.js so reviews match the rest of the bot.
'use strict';

const { SlashCommandBuilder, MessageFlags, ChannelType } = require('discord.js');
const store = require('../vouch/store');
const { panelEmbed, panelComponents, updatePanel } = require('../vouch/panel');
const guildConfig = require('../core/guildConfig');
const { isStaff } = require('../core/perms');
const { baseEmbed, COLORS, EMOJI } = require('../ui/theme');
const logger = require('../core/logger');

const data = new SlashCommandBuilder()
  .setName('vouches')
  .setDescription('Shop reviews — panel, stats, and configuration')
  .addSubcommand((s) => s.setName('panel').setDescription('Post the review panel with a Leave-a-Vouch button (staff)')
    .addChannelOption((o) => o.setName('channel').setDescription('Where to post the panel (defaults to here)')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
  .addSubcommand((s) => s.setName('stats').setDescription('Overall rating, total reviews, and star breakdown'))
  .addSubcommand((s) => s.setName('recent').setDescription('The latest reviews'))
  .addSubcommand((s) => s.setName('setup').setDescription('Set the channel where reviews are posted (staff)')
    .addChannelOption((o) => o.setName('channel').setDescription('Reviews feed channel')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true)))
  .addSubcommand((s) => s.setName('remove').setDescription("Remove a member's review (staff)")
    .addUserOption((o) => o.setName('user').setDescription('Whose review to remove').setRequired(true)));

// A 10-cell proportional bar for the star breakdown.
function bar(n, max) {
  const filled = max > 0 ? Math.round((n / max) * 10) : 0;
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const gid = interaction.guildId;
  const eph = MessageFlags.Ephemeral;

  try {
    if (sub === 'panel') {
      if (!isStaff(interaction.member, gid)) {
        return interaction.reply({ content: `${EMOJI.error} You need Manage Server to post the panel.`, flags: eph });
      }
      const channel = interaction.options.getChannel('channel') || interaction.channel;
      if (!channel || typeof channel.send !== 'function') {
        return interaction.reply({ content: `${EMOJI.error} Pick a text channel I can post in.`, flags: eph });
      }
      const msg = await channel.send({ embeds: [panelEmbed(interaction, store.stats(gid))], components: panelComponents() });
      guildConfig.set(gid, { vouch: { panelChannelId: channel.id, panelMessageId: msg.id } });
      return interaction.reply({ content: `${EMOJI.success} Review panel posted in <#${channel.id}>.`, flags: eph });
    }

    if (sub === 'stats') {
      const { count, average, distribution } = store.stats(gid);
      const embed = baseEmbed(interaction, { color: COLORS.brand }).setAuthor({ name: 'Shop Reviews' });
      if (!count) {
        embed.setDescription('*No reviews yet — be the first with `/vouch`.*');
      } else {
        const max = Math.max(...Object.values(distribution));
        const breakdown = [5, 4, 3, 2, 1].map((n) => `**${n}★**  \`${bar(distribution[n], max)}\`  ${distribution[n]}`).join('\n');
        embed.setDescription(`${EMOJI.star} **${average} / 5**  ${EMOJI.dot}  ${count} review${count === 1 ? '' : 's'}\n\n${breakdown}`);
      }
      return interaction.reply({ embeds: [embed], flags: eph });
    }

    if (sub === 'recent') {
      const recent = store.recent(gid, 5);
      const embed = baseEmbed(interaction, { color: COLORS.accent }).setAuthor({ name: 'Recent Reviews' });
      embed.setDescription(recent.length
        ? recent.map((r) => `${'⭐'.repeat(r.rating)}  ${EMOJI.dot}  <@${r.from}>  ${EMOJI.dot}  <t:${Math.floor(r.ts / 1000)}:R>\n${r.comment ? `> ${String(r.comment).slice(0, 200)}` : ''}`).join('\n\n').slice(0, 4000)
        : '*No reviews yet.*');
      return interaction.reply({ embeds: [embed], flags: eph });
    }

    if (sub === 'setup') {
      if (!isStaff(interaction.member, gid)) {
        return interaction.reply({ content: `${EMOJI.error} You need Manage Server to configure reviews.`, flags: eph });
      }
      const channel = interaction.options.getChannel('channel');
      if (!channel || typeof channel.send !== 'function') {
        return interaction.reply({ content: `${EMOJI.error} Pick a text channel I can post in.`, flags: eph });
      }
      guildConfig.set(gid, { vouch: { channelId: channel.id } });
      return interaction.reply({ content: `${EMOJI.success} Reviews will be posted to <#${channel.id}>.`, flags: eph });
    }

    if (sub === 'remove') {
      if (!isStaff(interaction.member, gid)) {
        return interaction.reply({ content: `${EMOJI.error} You need Manage Server to remove reviews.`, flags: eph });
      }
      const user = interaction.options.getUser('user');
      const res = await store.removeReview(gid, user.id);
      if (res.removed) await updatePanel(interaction.guild);
      return interaction.reply({
        content: res.removed
          ? `${EMOJI.success} Removed ${user}'s review. ${res.count} review${res.count === 1 ? '' : 's'} left.`
          : `${EMOJI.warn} ${user} hasn't left a review.`,
        flags: eph,
      });
    }
  } catch (e) {
    logger.error('[vouches]', e.message);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: `${EMOJI.warn} Vouches command failed.`, flags: eph }).catch(() => {});
    }
  }
}

module.exports = { data, execute, bypassModGate: true };
