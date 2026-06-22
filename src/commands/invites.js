// src/commands/invites.js — public invite-tracking command with a staff-gated setup subcommand.
//
// bypassModGate: true makes /invites view and /invites leaderboard usable by everyone.
// Because the whole command bypasses the global mod gate, the `setup` subcommand
// MUST self-check isStaff() (Manage Server) before mutating config.
//
// Stats/leaderboard data come from src/invites/tracker.js (the persistence hub) —
// we only read from it here; recording happens in the GuildMemberAdd/Remove flow.
'use strict';

const { SlashCommandBuilder, MessageFlags, EmbedBuilder, ChannelType } = require('discord.js');
const guildConfig = require('../core/guildConfig');
const tracker = require('../invites/tracker');
const { isStaff } = require('../core/perms');
const logger = require('../core/logger');

const data = new SlashCommandBuilder()
  .setName('invites')
  .setDescription('View invite stats, the leaderboard, or set up invite tracking.')
  .addSubcommand((sub) =>
    sub
      .setName('view')
      .setDescription("View a member's invite stats (defaults to you).")
      .addUserOption((opt) =>
        opt.setName('user').setDescription('The member to look up (defaults to you).').setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub.setName('leaderboard').setDescription('Show the top inviters in this server.')
  )
  .addSubcommand((sub) =>
    sub
      .setName('setup')
      .setDescription('Enable invite tracking and choose the join-log channel (Manage Server).')
      .addChannelOption((opt) =>
        opt
          .setName('channel')
          .setDescription('Channel where invite joins will be logged.')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(true)
      )
  );

async function execute(interaction) {
  try {
    const gid = interaction.guildId;
    const sub = interaction.options.getSubcommand();

    // ── view ──────────────────────────────────────────────────────────────────
    if (sub === 'view') {
      const target = interaction.options.getUser('user') || interaction.user;
      const s = tracker.getStats(gid, target.id);
      const embed = new EmbedBuilder()
        .setTitle(`🔗 Invites for ${target.tag}`)
        .setColor(0x3498db)
        .addFields(
          { name: 'Total', value: String(s.real + s.fake), inline: true },
          { name: 'Real', value: String(s.real), inline: true },
          { name: 'Fake', value: String(s.fake), inline: true },
          { name: 'Left', value: String(s.left), inline: true }
        )
        .setTimestamp();
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    // ── leaderboard ─────────────────────────────────────────────────────────────
    if (sub === 'leaderboard') {
      const lb = tracker.leaderboard(gid).slice(0, 10);
      const embed = new EmbedBuilder().setTitle('🏆 Invite Leaderboard').setColor(0xf1c40f).setTimestamp();
      if (!lb.length) {
        embed.setDescription('No invites tracked yet.');
      } else {
        embed.setDescription(
          lb
            .map(
              (e, i) =>
                `**${i + 1}.** <@${e.inviterId}> — ${e.total} invites (real ${e.real} / fake ${e.fake} / left ${e.left})`
            )
            .join('\n')
        );
      }
      return interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      });
    }

    // ── setup (self-gated: Manage Server) ────────────────────────────────────────
    if (sub === 'setup') {
      if (!isStaff(interaction.member, gid)) {
        return interaction.reply({
          content: '⛔ You need Manage Server to configure invite tracking.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const channel = interaction.options.getChannel('channel');
      if (!channel || typeof channel.send !== 'function') {
        return interaction.reply({
          content: '⛔ Please choose a text channel I can send messages to.',
          flags: MessageFlags.Ephemeral,
        });
      }

      guildConfig.set(gid, { invites: { enabled: true, logChannelId: channel.id } });

      // Seed the live invite-use cache so the very next join can be attributed.
      await require('../invites').seedGuild(interaction.guild).catch(() => {});

      return interaction.reply({
        content: `✅ Invite tracking enabled. Joins will be logged to <#${channel.id}>.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    // Unknown subcommand — should be unreachable, but ack once to be safe.
    return interaction.reply({
      content: '⛔ Unknown subcommand.',
      flags: MessageFlags.Ephemeral,
    });
  } catch (e) {
    logger.error('[command:invites]', e.message);
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({
          content: '⚠️ Something went wrong handling that command.',
          flags: MessageFlags.Ephemeral,
        });
      } else {
        await interaction.reply({
          content: '⚠️ Something went wrong handling that command.',
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch (inner) {
      logger.error('[command:invites:ack]', inner.message);
    }
  }
}

module.exports = { data, execute, bypassModGate: true };
