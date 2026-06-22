// src/embeds/interactions.js — interactive visual embed builder.
// Namespace: all customIds are prefixed with "eb:". Register with client via register(client).
// Do NOT import from index.js — the orchestrator wires this module in afterward.
'use strict';

const {
  Events,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');

const { buildEmbed, checkSendPerms, BRAND } = require('./build');
const modlog = require('../core/modlog');
const logger = require('../core/logger');

// ---------------------------------------------------------------------------
// In-memory drafts, keyed by user id. Single source of truth for one user's
// in-progress embed. Cleared on send/cancel.
// ---------------------------------------------------------------------------
const drafts = new Map(); // userId -> { title, description, color, image, thumbnail, footer, author_name, channelId }

function initDraft(userId, channelId) {
  const draft = { channelId: channelId || null };
  drafts.set(userId, draft);
  return draft;
}
function getDraft(userId) {
  return drafts.get(userId) || null;
}
function clearDraft(userId) {
  drafts.delete(userId);
}

// Fields that can be edited via modals, plus the input style each uses.
const FIELDS = {
  title: { label: 'Title', style: TextInputStyle.Short, max: 256 },
  description: { label: 'Description', style: TextInputStyle.Paragraph, max: 4000 },
  color: { label: 'Color', style: TextInputStyle.Short, max: 7, placeholder: '#5865F2' },
  image: { label: 'Image', style: TextInputStyle.Short, max: 1024, placeholder: 'https://…' },
  thumbnail: { label: 'Thumbnail', style: TextInputStyle.Short, max: 1024, placeholder: 'https://…' },
  footer: { label: 'Footer', style: TextInputStyle.Short, max: 2048 },
  author: { label: 'Author', style: TextInputStyle.Short, max: 256 },
};

// Map the "author" UI field to the buildEmbed option name.
function draftField(field) {
  return field === 'author' ? 'author_name' : field;
}

// ---------------------------------------------------------------------------
// Preview embed: tolerate a missing/empty draft by showing a placeholder.
// ---------------------------------------------------------------------------
function buildPreview(draft) {
  const { embed } = buildEmbed({
    title: draft.title,
    description: draft.description,
    color: draft.color,
    image: draft.image,
    thumbnail: draft.thumbnail,
    footer: draft.footer,
    author_name: draft.author_name,
  });
  if (embed) return embed;
  // buildEmbed returns {error} when no title/description (or invalid field);
  // fall back to a placeholder so the preview always renders.
  return new EmbedBuilder()
    .setDescription('Empty — use the buttons to build your message.')
    .setColor(BRAND);
}

// ---------------------------------------------------------------------------
// Single source of truth for the component rows.
// ---------------------------------------------------------------------------
function rebuildComponents(draft) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('eb:set:title').setLabel('Title').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('eb:set:description').setLabel('Description').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('eb:set:color').setLabel('Color').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('eb:set:image').setLabel('Image').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('eb:set:thumbnail').setLabel('Thumbnail').setStyle(ButtonStyle.Secondary),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('eb:set:footer').setLabel('Footer').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('eb:set:author').setLabel('Author').setStyle(ButtonStyle.Secondary),
  );

  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId('eb:channel')
    .setPlaceholder('Target channel (defaults to here)')
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(1)
    .setMaxValues(1);
  if (draft.channelId) channelSelect.setDefaultChannels(draft.channelId);
  const row3 = new ActionRowBuilder().addComponents(channelSelect);

  const row4 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('eb:send').setLabel('Send').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('eb:cancel').setLabel('Cancel').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('eb:savedesign').setLabel('💾 Save as design').setStyle(ButtonStyle.Primary),
  );

  return [row1, row2, row3, row4];
}

// Build the full ephemeral payload (preview + components) used to refresh.
function renderPanel(draft) {
  return { embeds: [buildPreview(draft)], components: rebuildComponents(draft) };
}

// ---------------------------------------------------------------------------
// register
// ---------------------------------------------------------------------------
function register(client) {
  client.on(Events.InteractionCreate, async (interaction) => {
    // Early-return unless this is one of our namespaced component/modal interactions.
    const id = interaction.customId;
    if (!id || !id.startsWith('eb:')) return;

    try {
      // --- Field buttons: open a prefilled modal -----------------------------
      if (interaction.isButton() && id.startsWith('eb:set:')) {
        const field = id.slice('eb:set:'.length);
        const spec = FIELDS[field];
        if (!spec) return;

        const draft = getDraft(interaction.user.id);
        const current = draft ? (draft[draftField(field)] || '') : '';

        const input = new TextInputBuilder()
          .setCustomId('value')
          .setLabel(spec.label)
          .setStyle(spec.style)
          .setRequired(false)
          .setMaxLength(spec.max);
        if (spec.placeholder) input.setPlaceholder(spec.placeholder);
        if (current) input.setValue(String(current).slice(0, spec.max));

        const modal = new ModalBuilder()
          .setCustomId(`eb:modal:${field}`)
          .setTitle(`Set ${spec.label}`)
          .addComponents(new ActionRowBuilder().addComponents(input));

        return interaction.showModal(modal);
      }

      // --- Modal submit: store the value and refresh the panel ---------------
      if (interaction.isModalSubmit() && id.startsWith('eb:modal:')) {
        const field = id.slice('eb:modal:'.length);
        if (!FIELDS[field]) return;

        let draft = getDraft(interaction.user.id);
        if (!draft) draft = initDraft(interaction.user.id, interaction.channelId);

        const value = interaction.fields.getTextInputValue('value');
        const key = draftField(field);
        if (value && value.trim()) draft[key] = value;
        else delete draft[key]; // cleared field

        return interaction.update(renderPanel(draft));
      }

      // --- Channel select: store target and refresh --------------------------
      if (interaction.isChannelSelectMenu() && id === 'eb:channel') {
        let draft = getDraft(interaction.user.id);
        if (!draft) draft = initDraft(interaction.user.id, interaction.channelId);
        draft.channelId = interaction.values[0];
        return interaction.update(renderPanel(draft));
      }

      // --- Send --------------------------------------------------------------
      if (interaction.isButton() && id === 'eb:send') {
        const draft = getDraft(interaction.user.id);
        if (!draft) {
          return interaction.reply({
            content: '⛔ Your draft expired. Run /embedbuilder again.',
            flags: MessageFlags.Ephemeral,
          });
        }

        const { embed, error } = buildEmbed({
          title: draft.title,
          description: draft.description,
          color: draft.color,
          image: draft.image,
          thumbnail: draft.thumbnail,
          footer: draft.footer,
          author_name: draft.author_name,
        });
        if (error) {
          // Do NOT clear the draft — let the user keep editing.
          return interaction.reply({ content: `⛔ ${error}`, flags: MessageFlags.Ephemeral });
        }

        const channel =
          (draft.channelId && interaction.guild.channels.cache.get(draft.channelId)) ||
          interaction.channel;
        if (!channel) {
          return interaction.reply({
            content: '⛔ Target channel not found.',
            flags: MessageFlags.Ephemeral,
          });
        }

        const missing = checkSendPerms(channel, interaction.guild.members.me, false);
        if (missing.length > 0) {
          return interaction.reply({
            content: `⛔ I'm missing permissions in <#${channel.id}>: **${missing.join(', ')}**`,
            flags: MessageFlags.Ephemeral,
          });
        }

        const sent = await channel.send({ embeds: [embed] });
        clearDraft(interaction.user.id);

        await interaction.update({
          content: `✅ Sent to <#${channel.id}>. [Jump](${sent.url})`,
          embeds: [],
          components: [],
        });

        await modlog.log(interaction.guild, {
          title: '📢 Embed posted (builder)',
          description: `**By:** ${interaction.user.tag}\n**Channel:** <#${channel.id}>${draft.title ? `\n**Title:** ${draft.title}` : ''}`,
          color: 0x5865F2,
        });
        return;
      }

      // --- Cancel ------------------------------------------------------------
      if (interaction.isButton() && id === 'eb:cancel') {
        clearDraft(interaction.user.id);
        return interaction.update({ content: '❌ Cancelled.', embeds: [], components: [] });
      }

      // --- Save as design: open a modal asking for a name --------------------
      if (interaction.isButton() && id === 'eb:savedesign') {
        const input = new TextInputBuilder()
          .setCustomId('name')
          .setLabel('Design name')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(80);
        const modal = new ModalBuilder()
          .setCustomId('eb:savemodal')
          .setTitle('Save design as…')
          .addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
      }

      // --- Save modal submit: persist the current draft as a named design ----
      if (interaction.isModalSubmit() && id === 'eb:savemodal') {
        const draft = getDraft(interaction.user.id);
        if (!draft) {
          return interaction.reply({
            content: '⛔ Your draft expired. Run /embedbuilder again.',
            flags: MessageFlags.Ephemeral,
          });
        }

        const { embed, error } = buildEmbed({
          title: draft.title,
          description: draft.description,
          color: draft.color,
          image: draft.image,
          thumbnail: draft.thumbnail,
          footer: draft.footer,
          author_name: draft.author_name,
        });
        if (error) {
          return interaction.reply({ content: `⛔ ${error}`, flags: MessageFlags.Ephemeral });
        }

        const name = interaction.fields.getTextInputValue('name').trim();
        if (!name) {
          return interaction.reply({ content: '⛔ Name required.', flags: MessageFlags.Ephemeral });
        }

        require('../autopost/designs').save(interaction.guildId, name, embed.toJSON());
        return interaction.reply({
          content: `✅ Saved design '${name}'. Schedule it with /autopost create design:${name}`,
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch (e) {
      logger.error('[embedbuilder:interaction]', e.message);
      if (
        interaction.isRepliable() &&
        !interaction.replied &&
        !interaction.deferred
      ) {
        await interaction
          .reply({ content: '⚠️ Something went wrong.', flags: MessageFlags.Ephemeral })
          .catch(() => {});
      }
    }
  });
}

module.exports = {
  register,
  initDraft,
  getDraft,
  clearDraft,
  rebuildComponents,
  buildPreview,
  renderPanel,
};
