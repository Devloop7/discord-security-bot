// src/commands/membercount.js — /membercount: show the server's member total.
// Public command: bypassModGate = true so the dispatcher skips the global isMod gate.
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const logger = require('../core/logger');

const BRAND = 0x5865F2;

const data = new SlashCommandBuilder()
  .setName('membercount')
  .setDescription('Show how many members are in this server');

async function execute(interaction) {
  try {
    const guild = interaction.guild;

    // memberCount is the authoritative total (works even without a full cache).
    const total = guild.memberCount;

    // Humans/bots are best-effort from whatever is cached — the cache may be
    // partial, so we only show the split when it actually accounts for everyone.
    const cached = guild.members.cache;
    const bots = cached.filter((m) => m.user.bot).size;
    const humans = cached.size - bots;
    const breakdownComplete = cached.size >= total && total > 0;

    const embed = new EmbedBuilder()
      .setColor(BRAND)
      .setTitle(`${guild.name} — Member Count`)
      .setDescription(`👥 **${total}** ${total === 1 ? 'member' : 'members'}`)
      .setTimestamp();

    if (breakdownComplete) {
      embed.addFields(
        { name: 'Humans', value: String(humans), inline: true },
        { name: 'Bots', value: String(bots), inline: true },
      );
    }

    const icon = guild.iconURL();
    if (icon) embed.setThumbnail(icon);

    return interaction.reply({ embeds: [embed] });
  } catch (e) {
    logger.error('[membercount]', e.message);
    if (!interaction.replied && !interaction.deferred) {
      return interaction
        .reply({ content: "⚠️ Couldn't fetch the member count.", flags: MessageFlags.Ephemeral })
        .catch(() => {});
    }
    return interaction
      .followUp({ content: "⚠️ Couldn't fetch the member count.", flags: MessageFlags.Ephemeral })
      .catch(() => {});
  }
}

module.exports = { data, execute, bypassModGate: true };
