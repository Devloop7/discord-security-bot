// src/commands/vouch.js — /vouch @user [comment]: give a member a reputation vouch.
// Public (bypassModGate). Guards: no self-vouch, no bots, one vouch per person ever.
// Posts a branded embed (src/ui/theme.js) to the configured vouch channel if set.
'use strict';

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const store = require('../vouch/store');
const guildConfig = require('../core/guildConfig');
const RateWindow = require('../core/ratewindow');
const { baseEmbed, COLORS, EMOJI } = require('../ui/theme');
const logger = require('../core/logger');

// Light anti-spam: at most 5 vouches per minute per giver.
const rl = new RateWindow(60_000);

const data = new SlashCommandBuilder()
  .setName('vouch')
  .setDescription('Give a member a reputation vouch')
  .addUserOption((o) => o.setName('user').setDescription('The member to vouch for').setRequired(true))
  .addStringOption((o) => o.setName('comment').setDescription('Optional note (e.g. "fast, legit trade")').setMaxLength(500));

// The shared vouch embed (used for the channel feed + can be reused).
function vouchEmbed(interaction, target, count, comment) {
  const embed = baseEmbed(interaction, { color: COLORS.success })
    .setAuthor({ name: 'New Vouch', iconURL: interaction.user.displayAvatarURL() })
    .setDescription(`${EMOJI.success}  ${interaction.user} vouched for ${target}`)
    .addFields({ name: 'Total vouches', value: `${EMOJI.star} **${count}**`, inline: true });
  if (comment) embed.addFields({ name: 'Comment', value: comment.slice(0, 1024), inline: false });
  return embed;
}

async function execute(interaction) {
  try {
    const target = interaction.options.getUser('user');
    const comment = interaction.options.getString('comment');
    const gid = interaction.guildId;

    if (target.id === interaction.user.id) {
      return interaction.reply({ content: `${EMOJI.error} You can't vouch for yourself.`, flags: MessageFlags.Ephemeral });
    }
    if (target.bot) {
      return interaction.reply({ content: `${EMOJI.error} You can't vouch for a bot.`, flags: MessageFlags.Ephemeral });
    }
    if (rl.record(interaction.user.id) > 5) {
      return interaction.reply({ content: `${EMOJI.warn} Slow down — too many vouches in a short time.`, flags: MessageFlags.Ephemeral });
    }

    const res = await store.addVouch(gid, interaction.user.id, target.id, comment);
    if (res.error) {
      return interaction.reply({ content: `${EMOJI.error} ${res.error}`, flags: MessageFlags.Ephemeral });
    }

    // Post to the configured vouch feed channel, if any.
    let posted = false;
    const channelId = guildConfig.get(gid).vouch.channelId;
    if (channelId) {
      const ch = interaction.guild.channels.cache.get(channelId)
        || (await interaction.guild.channels.fetch(channelId).catch(() => null));
      if (ch && typeof ch.send === 'function') {
        await ch.send({
          content: `${target}`,
          embeds: [vouchEmbed(interaction, target, res.count, comment)],
          allowedMentions: { users: [target.id] },
        }).then(() => { posted = true; }).catch(() => {});
      }
    }

    return interaction.reply({
      content: `${EMOJI.success} You vouched for ${target} — they now have **${res.count}** vouch${res.count === 1 ? '' : 'es'}.`
        + (posted ? ` Posted to <#${channelId}>.` : ''),
      flags: MessageFlags.Ephemeral,
    });
  } catch (e) {
    logger.error('[vouch]', e.message);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: `${EMOJI.warn} Couldn't record that vouch.`, flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }
}

module.exports = { data, execute, bypassModGate: true };
