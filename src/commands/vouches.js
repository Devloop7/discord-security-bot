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
    .addUserOption((o) => o.setName('user').setDescription('Whose review to remove').setRequired(true)))
  .addSubcommand((s) => s.setName('branding').setDescription('Set the vouch banner, logo & thank-you footer (staff)')
    .addStringOption((o) => o.setName('banner').setDescription('Big image URL on each vouch — or "none" to clear'))
    .addStringOption((o) => o.setName('thumbnail').setDescription('Logo URL (top-right); defaults to server icon — or "none"'))
    .addStringOption((o) => o.setName('footer').setDescription('Footer text; {server} = server name — or "none"')))
  .addSubcommand((s) => s.setName('cooldown').setDescription('Days a member must wait between vouches (staff)')
    .addIntegerOption((o) => o.setName('days').setDescription('0 = no limit; default 3').setRequired(true).setMinValue(0).setMaxValue(365)));

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

    if (sub === 'branding') {
      if (!isStaff(interaction.member, gid)) {
        return interaction.reply({ content: `${EMOJI.error} You need Manage Server to change vouch branding.`, flags: eph });
      }
      const banner = interaction.options.getString('banner');
      const thumbnail = interaction.options.getString('thumbnail');
      const footer = interaction.options.getString('footer');
      if (banner === null && thumbnail === null && footer === null) {
        return interaction.reply({ content: `${EMOJI.warn} Provide at least one of: banner, thumbnail, footer.`, flags: eph });
      }
      const isUrl = (s) => /^https?:\/\/\S+$/i.test(s);
      const clean = (s) => (s && s.trim().toLowerCase() === 'none' ? null : s);
      const patch = {};
      if (banner !== null) {
        const b = clean(banner);
        if (b && !isUrl(b)) return interaction.reply({ content: `${EMOJI.error} Banner must be an http(s) image URL (or "none").`, flags: eph });
        patch.bannerUrl = b;
      }
      if (thumbnail !== null) {
        const t = clean(thumbnail);
        if (t && !isUrl(t)) return interaction.reply({ content: `${EMOJI.error} Thumbnail must be an http(s) image URL (or "none").`, flags: eph });
        patch.thumbnailUrl = t;
      }
      if (footer !== null) patch.footerText = clean(footer);
      guildConfig.set(gid, { vouch: patch });
      return interaction.reply({ content: `${EMOJI.success} Vouch branding updated. Preview it with \`/vouch\`.`, flags: eph });
    }

    if (sub === 'cooldown') {
      if (!isStaff(interaction.member, gid)) {
        return interaction.reply({ content: `${EMOJI.error} You need Manage Server to change the cooldown.`, flags: eph });
      }
      const days = interaction.options.getInteger('days');
      guildConfig.set(gid, { vouch: { cooldownDays: days } });
      return interaction.reply({
        content: days === 0
          ? `${EMOJI.success} Cooldown removed — members can vouch anytime.`
          : `${EMOJI.success} Members can now leave a vouch once every **${days}** day${days === 1 ? '' : 's'}.`,
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
