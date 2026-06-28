// src/commands/vouches.js — /vouches view | leaderboard | setup | remove
// Public command (bypassModGate); the staff-only subcommands self-gate via isStaff.
// All embeds use src/ui/theme.js so vouches match the rest of the bot.
'use strict';

const { SlashCommandBuilder, MessageFlags, ChannelType } = require('discord.js');
const store = require('../vouch/store');
const guildConfig = require('../core/guildConfig');
const { isStaff } = require('../core/perms');
const { baseEmbed, COLORS, EMOJI } = require('../ui/theme');
const logger = require('../core/logger');

const data = new SlashCommandBuilder()
  .setName('vouches')
  .setDescription('View vouches, the leaderboard, or configure the system')
  .addSubcommand((s) => s.setName('view').setDescription("See a member's vouches")
    .addUserOption((o) => o.setName('user').setDescription('Member (defaults to you)')))
  .addSubcommand((s) => s.setName('leaderboard').setDescription('Top vouched members'))
  .addSubcommand((s) => s.setName('setup').setDescription('Set the vouch feed channel (staff)')
    .addChannelOption((o) => o.setName('channel').setDescription('Channel where vouches are posted')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true)))
  .addSubcommand((s) => s.setName('remove').setDescription('Remove a fake vouch (staff)')
    .addUserOption((o) => o.setName('from').setDescription('Who gave the vouch').setRequired(true))
    .addUserOption((o) => o.setName('user').setDescription('Who received it').setRequired(true)));

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const gid = interaction.guildId;
  const eph = MessageFlags.Ephemeral;

  try {
    if (sub === 'view') {
      const target = interaction.options.getUser('user') || interaction.user;
      const count = store.countFor(gid, target.id);
      const recent = store.recentFor(gid, target.id, 5);
      const embed = baseEmbed(interaction, { color: COLORS.brand })
        .setAuthor({ name: `Vouches for ${target.tag}`, iconURL: target.displayAvatarURL() })
        .setDescription(`${EMOJI.star} **${count}** total vouch${count === 1 ? '' : 'es'}`);
      if (recent.length) {
        embed.addFields({
          name: 'Recent',
          value: recent.map((v) => `${EMOJI.bullet} <@${v.from}>${v.comment ? ` — ${v.comment}` : ''}  ·  <t:${Math.floor(v.ts / 1000)}:R>`).join('\n').slice(0, 1024),
        });
      }
      return interaction.reply({ embeds: [embed], flags: eph });
    }

    if (sub === 'leaderboard') {
      const lb = store.leaderboard(gid, 10);
      const embed = baseEmbed(interaction, { color: COLORS.accent })
        .setAuthor({ name: 'Vouch Leaderboard' });
      embed.setDescription(lb.length
        ? lb.map((e, i) => `**#${i + 1}**  <@${e.targetId}>  ${EMOJI.arrow}  ${EMOJI.star} **${e.count}**`).join('\n')
        : '*No vouches yet — be the first with `/vouch`.*');
      return interaction.reply({ embeds: [embed], flags: eph });
    }

    if (sub === 'setup') {
      if (!isStaff(interaction.member, gid)) {
        return interaction.reply({ content: `${EMOJI.error} You need Manage Server to configure vouches.`, flags: eph });
      }
      const channel = interaction.options.getChannel('channel');
      if (!channel || typeof channel.send !== 'function') {
        return interaction.reply({ content: `${EMOJI.error} Pick a text channel I can post in.`, flags: eph });
      }
      guildConfig.set(gid, { vouch: { channelId: channel.id } });
      return interaction.reply({ content: `${EMOJI.success} Vouches will be posted to <#${channel.id}>.`, flags: eph });
    }

    if (sub === 'remove') {
      if (!isStaff(interaction.member, gid)) {
        return interaction.reply({ content: `${EMOJI.error} You need Manage Server to remove vouches.`, flags: eph });
      }
      const from = interaction.options.getUser('from');
      const target = interaction.options.getUser('user');
      const res = await store.removeVouch(gid, from.id, target.id);
      return interaction.reply({
        content: res.removed
          ? `${EMOJI.success} Removed ${from}'s vouch for ${target}. They now have **${res.count}**.`
          : `${EMOJI.warn} No vouch from ${from} for ${target} was found.`,
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
