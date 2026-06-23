// src/commands/say.js — /say: post a plain-text message as the bot (staff only)
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
} = require('discord.js');
const { isStaff } = require('../core/perms');
const { checkSendPerms } = require('../embeds/build');
const { formatToText } = require('../core/format');
const modlog = require('../core/modlog');
const logger = require('../core/logger');

const data = new SlashCommandBuilder()
  .setName('say')
  .setDescription('Post a plain-text message as the bot (staff only)')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addStringOption((o) =>
    o
      .setName('message')
      .setDescription('Message text (max 2000 characters)')
      .setRequired(true)
      .setMaxLength(2000),
  )
  .addChannelOption((o) =>
    o
      .setName('channel')
      .setDescription('Channel to post in (defaults to current channel)')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
  );

async function execute(interaction) {
  if (!isStaff(interaction.member, interaction.guildId)) {
    return interaction.reply({ content: '⛔ Staff only.', flags: MessageFlags.Ephemeral });
  }

  const raw = interaction.options.getString('message', true);
  const message = formatToText(raw).slice(0, 2000) || raw; // tidy spacing/lists
  const channel = interaction.options.getChannel('channel') ?? interaction.channel;

  const missing = checkSendPerms(channel, interaction.guild.members.me, false);
  if (missing.length > 0) {
    return interaction.reply({
      content: `⛔ I'm missing permissions in <#${channel.id}>: **${missing.join(', ')}**`,
      flags: MessageFlags.Ephemeral,
    });
  }

  try {
    const sent = await channel.send({
      content: message,
      allowedMentions: { parse: [] }, // never ping — anti-abuse
    });

    await interaction.reply({
      content: `✅ Posted in <#${channel.id}>. [Jump](${sent.url})`,
      flags: MessageFlags.Ephemeral,
    });

    await modlog.log(interaction.guild, {
      title: '💬 Message posted',
      description: `**By:** ${interaction.user.tag}\n**Channel:** <#${channel.id}>\n**Content:** ${message.slice(0, 300)}${message.length > 300 ? '…' : ''}`,
      color: 0x2ECC71,
    });
  } catch (err) {
    logger.error('[say:execute]', err.message);
    if (!interaction.replied && !interaction.deferred) {
      await interaction
        .reply({ content: '⚠️ Failed to post message.', flags: MessageFlags.Ephemeral })
        .catch(() => {});
    } else {
      await interaction
        .followUp({ content: '⚠️ Failed to post message.', flags: MessageFlags.Ephemeral })
        .catch(() => {});
    }
  }
}

module.exports = { data, execute, bypassModGate: true };
