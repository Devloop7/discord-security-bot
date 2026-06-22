// src/commands/avatar.js — /avatar: show a user's avatar with format links (public)
// bypassModGate = true: this is a public, read-only command; the dispatcher
// skips the global isMod gate so anyone can use it.
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const logger = require('../core/logger');

const BRAND = 0x5865F2;

const data = new SlashCommandBuilder()
  .setName('avatar')
  .setDescription("Show a user's avatar (defaults to you)")
  .addUserOption((o) =>
    o.setName('user').setDescription('User to show the avatar of (defaults to you)'),
  );

async function execute(interaction) {
  try {
    const user = interaction.options.getUser('user') ?? interaction.user;

    // Markdown links to the global (account) avatar in each format.
    const formats = ['png', 'webp', 'jpg'];
    const links = formats.map(
      (extension) =>
        `[${extension.toUpperCase()}](${user.displayAvatarURL({ extension, size: 1024 })})`,
    );

    // Animated avatars expose a GIF variant; only link it when one exists.
    if (user.avatar && user.avatar.startsWith('a_')) {
      links.push(`[GIF](${user.displayAvatarURL({ extension: 'gif', size: 1024 })})`);
    }

    const lines = [`**Formats:** ${links.join(' • ')}`];

    // If the user is in this guild and has a server-specific avatar, link it too.
    if (interaction.guild) {
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      const serverAvatar = member ? member.avatarURL({ size: 1024 }) : null;
      if (serverAvatar) {
        lines.push(`**Server avatar:** [View](${serverAvatar})`);
      }
    }

    const embed = new EmbedBuilder()
      .setColor(BRAND)
      .setTitle(`${user.tag}'s avatar`)
      .setDescription(lines.join('\n'))
      .setImage(user.displayAvatarURL({ size: 1024 }))
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  } catch (e) {
    logger.error('[avatar]', e.message);
    if (!interaction.replied && !interaction.deferred) {
      await interaction
        .reply({ content: "⚠️ Couldn't fetch that avatar.", flags: MessageFlags.Ephemeral })
        .catch(() => {});
    } else {
      await interaction
        .followUp({ content: "⚠️ Couldn't fetch that avatar.", flags: MessageFlags.Ephemeral })
        .catch(() => {});
    }
  }
}

module.exports = { data, execute, bypassModGate: true };
