// src/vouch/panel.js — the review panel, the review embed, and the
// button → star-select → modal interaction flow. All visuals come from
// src/ui/theme.js so the system matches the rest of the bot.
//
// customIds (namespace "vouch:"):
//   button  'vouch:leave'         → open the star picker
//   select  'vouch:stars'         → values:["1".."5"], opens the modal
//   modal   'vouch:modal:<rating>'→ records the review + posts it + refreshes the panel
'use strict';

const {
  Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags,
} = require('discord.js');
const store = require('./store');
const guildConfig = require('../core/guildConfig');
const { baseEmbed, brandIcon, COLORS, EMOJI } = require('../ui/theme');
const logger = require('../core/logger');

const DAY_MS = 86400000;

// ── small renderers ──────────────────────────────────────────────────────────
function renderStars(rating) {
  const r = Math.max(0, Math.min(5, Number(rating) || 0));
  return `${'⭐'.repeat(r)}  \`${r}/5\``;
}
function ratingColor(rating) {
  if (rating >= 5) return COLORS.success;
  if (rating === 4) return COLORS.brand;
  if (rating === 3) return COLORS.warning;
  return COLORS.danger;
}
function isImageUrl(s) {
  return /^https?:\/\/\S+\.(png|jpe?g|gif|webp)(\?\S*)?$/i.test(String(s || ''));
}

// ── panel (the posted, button-bearing message) ───────────────────────────────
function panelEmbed(scope, stats) {
  const proof = stats.count > 0
    ? `**${EMOJI.star} ${stats.average} / 5**  ${EMOJI.dot}  ${stats.count} review${stats.count === 1 ? '' : 's'}\n\n`
    : '';
  const embed = baseEmbed(scope, { color: COLORS.success })
    .setTitle('Share your experience')
    .setDescription(
      `${proof}We'd love to hear your thoughts — your feedback helps others and helps us improve and level up.\n\n` +
      `${EMOJI.star}  Rate your order\n` +
      `${EMOJI.bulb}  Tell us what stood out\n` +
      `📸  Add proof if you want\n\n` +
      `**Ready to share feedback?**\nTap **Leave a Vouch** below to open the review form.`,
    );
  const icon = scope?.guild?.iconURL?.() || scope?.iconURL?.();
  if (icon) embed.setThumbnail(icon);
  return embed;
}
function panelComponents() {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('vouch:leave').setLabel('Leave a Vouch').setEmoji('📝').setStyle(ButtonStyle.Success),
  )];
}

// ── star picker + modal ──────────────────────────────────────────────────────
function starSelectComponents() {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('vouch:stars')
    .setPlaceholder('Rate your experience…')
    .addOptions([5, 4, 3, 2, 1].map((n) => ({
      label: `${n} star${n === 1 ? '' : 's'}`,
      value: String(n),
      emoji: '⭐',
    })));
  return [new ActionRowBuilder().addComponents(menu)];
}
function reviewModal(rating) {
  return new ModalBuilder()
    .setCustomId(`vouch:modal:${rating}`)
    .setTitle(`Your review — ${rating}★`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('comment').setLabel('What stood out?')
          .setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('proof').setLabel('Proof link (optional)')
          .setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(500)
          .setPlaceholder('https://… screenshot / receipt'),
      ),
    );
}

// ── posted review embed (rich, premium — matches a top-tier vouch bot) ───────
function reviewEmbed(scope, reviewer, review) {
  const cfg = guildConfig.get(scope.guild.id).vouch;
  const ts = review.ts || Date.now();

  const embed = new EmbedBuilder()
    .setColor(ratingColor(review.rating))
    .setTitle('New Vouch Received 🎉')
    .addFields(
      { name: 'Vouch ID', value: `\`Nº ${review.id ?? '—'}\``, inline: false },
      { name: 'Rating', value: '⭐'.repeat(review.rating), inline: false },
      { name: 'Feedback', value: review.comment ? String(review.comment).slice(0, 1024) : '*No feedback given.*', inline: false },
      { name: 'Vouched By', value: `<@${reviewer.id}>`, inline: true },
      { name: 'Vouched At', value: `<t:${Math.floor(ts / 1000)}:R>`, inline: true },
    )
    .setTimestamp(ts);

  // Thumbnail (top-right): configured logo, else the server icon.
  const thumb = cfg.thumbnailUrl || scope.guild.iconURL?.({ size: 256 });
  if (thumb) embed.setThumbnail(thumb);

  // Big image: a configured shop banner wins; otherwise an image proof.
  let bigImage = null;
  if (cfg.bannerUrl) bigImage = cfg.bannerUrl;
  else if (isImageUrl(review.proof)) bigImage = review.proof;
  if (bigImage) embed.setImage(bigImage);
  // Keep proof reachable if it wasn't shown as the main image.
  if (review.proof && bigImage !== review.proof) {
    embed.addFields({ name: 'Proof', value: `[view](${review.proof})`, inline: false });
  }

  // Footer: a custom thank-you ({server} supported) + the bot's icon.
  const thankYou = (cfg.footerText || 'Thanks for supporting {server} 💜').replace(/\{server\}/g, scope.guild.name);
  const icon = brandIcon(scope);
  embed.setFooter(icon ? { text: thankYou, iconURL: icon } : { text: thankYou });
  return embed;
}

// Refresh the live panel message with the latest stats (no-op if not configured / deleted).
async function updatePanel(guild) {
  try {
    const cfg = guildConfig.get(guild.id).vouch;
    if (!cfg.panelChannelId || !cfg.panelMessageId) return;
    const ch = guild.channels.cache.get(cfg.panelChannelId) || await guild.channels.fetch(cfg.panelChannelId).catch(() => null);
    if (!ch) return;
    const msg = await ch.messages.fetch(cfg.panelMessageId).catch(() => null);
    if (!msg) return;
    await msg.edit({ embeds: [panelEmbed(guild, store.stats(guild.id))], components: panelComponents() });
  } catch (e) {
    logger.error('[vouch:updatePanel]', e.message);
  }
}

// ── interaction router ───────────────────────────────────────────────────────
function register(client) {
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (!interaction.guild) return;
      const id = interaction.customId;
      if (!id || !id.startsWith('vouch:')) return; // namespace early-return

      // Open the star picker (unless the member is still on cooldown).
      if (interaction.isButton() && id === 'vouch:leave') {
        const cfg = guildConfig.get(interaction.guild.id).vouch;
        const remain = store.cooldownRemaining(interaction.guild.id, interaction.user.id, (cfg.cooldownDays || 0) * DAY_MS);
        if (remain > 0) {
          const when = Math.floor((Date.now() + remain) / 1000);
          return interaction.reply({ content: `⏳ You can leave another vouch <t:${when}:R>.`, flags: MessageFlags.Ephemeral });
        }
        return interaction.reply({ content: 'How many stars?', components: starSelectComponents(), flags: MessageFlags.Ephemeral });
      }

      // Star chosen → open the modal (must be the first response to this interaction).
      if (interaction.isStringSelectMenu() && id === 'vouch:stars') {
        const rating = parseInt(interaction.values[0], 10);
        if (!(rating >= 1 && rating <= 5)) return;
        return interaction.showModal(reviewModal(rating));
      }

      // Modal submitted → record + post + refresh.
      if (interaction.isModalSubmit() && id.startsWith('vouch:modal:')) {
        const rating = parseInt(id.slice('vouch:modal:'.length), 10);
        const comment = interaction.fields.getTextInputValue('comment');
        const proof = interaction.fields.getTextInputValue('proof');

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const now = Date.now();
        const cfg = guildConfig.get(interaction.guild.id).vouch;
        const res = await store.addReview(interaction.guild.id, interaction.user.id, { rating, comment, proof }, (cfg.cooldownDays || 0) * DAY_MS, now);
        if (res.error) {
          return interaction.editReply({
            content: res.retryAt
              ? `${EMOJI.error} You can leave another vouch <t:${Math.floor(res.retryAt / 1000)}:R>.`
              : `${EMOJI.error} ${res.error}`,
          });
        }

        let posted = false;
        if (cfg.channelId) {
          const ch = interaction.guild.channels.cache.get(cfg.channelId)
            || await interaction.guild.channels.fetch(cfg.channelId).catch(() => null);
          if (ch && typeof ch.send === 'function') {
            await ch.send({
              embeds: [reviewEmbed(interaction, interaction.user, { id: res.id, rating, comment, proof, ts: now })],
              allowedMentions: { parse: [] },
            }).then(() => { posted = true; }).catch(() => {});
          }
        }
        await updatePanel(interaction.guild);

        return interaction.editReply({
          content: `${EMOJI.success} Thanks for your ${rating}★ review!`
            + (posted ? ` It's now live in <#${cfg.channelId}>.` : ' (Ask an admin to set a reviews channel with `/vouches setup`.)'),
        });
      }
    } catch (e) {
      logger.error('[vouch:panel]', e.message);
      if (interaction.isRepliable?.() && !interaction.replied && !interaction.deferred) {
        interaction.reply({ content: `${EMOJI.warn} Something went wrong with that review.`, flags: MessageFlags.Ephemeral }).catch(() => {});
      } else if (interaction.deferred && !interaction.replied) {
        interaction.editReply({ content: `${EMOJI.warn} Something went wrong with that review.` }).catch(() => {});
      }
    }
  });
}

module.exports = {
  register, renderStars, ratingColor, isImageUrl,
  panelEmbed, panelComponents, starSelectComponents, reviewModal, reviewEmbed, updatePanel,
};
