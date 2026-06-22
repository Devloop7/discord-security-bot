// src/commands/purge.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const modlog = require('../core/modlog');
const logger = require('../core/logger');
const RateWindow = require('../core/ratewindow');

// Per-channel throttle: max 3 purges per 10s window.
const rl = new RateWindow(10_000);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('purge').setDescription('Bulk-delete recent messages with optional filters')
    .addIntegerOption((o) => o.setName('amount').setDescription('How many to delete (1–100)').setMinValue(1).setMaxValue(100).setRequired(true))
    .addUserOption((o) => o.setName('user').setDescription('Only delete messages from this user'))
    .addStringOption((o) => o.setName('contains').setDescription('Only delete messages containing this text'))
    .addBooleanOption((o) => o.setName('bots').setDescription('Only delete messages from bots'))
    .addBooleanOption((o) => o.setName('humans').setDescription('Only delete messages from humans')),
  bypassModGate: false, // mod only
  async execute(interaction) {
    // Throttle before doing any work — deletion is expensive.
    if (rl.record(interaction.channelId) > 3) {
      return interaction.reply({ content: '🐢 Slow down — too many purges in this channel.', flags: MessageFlags.Ephemeral });
    }

    const amount = interaction.options.getInteger('amount');
    const user = interaction.options.getUser('user');
    const contains = interaction.options.getString('contains');
    const bots = interaction.options.getBoolean('bots');
    const humans = interaction.options.getBoolean('humans');

    // Deletion can take a moment — ack first.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const fetched = await interaction.channel.messages.fetch({ limit: 100 });
      const needle = contains ? contains.toLowerCase() : null;

      // Apply filters, then take the first <amount> of the matching set.
      const filtered = [...fetched.values()].filter((m) => {
        if (user && m.author.id !== user.id) return false;
        if (needle && !m.content.toLowerCase().includes(needle)) return false;
        if (bots && m.author.bot !== true) return false;
        if (humans && m.author.bot !== false) return false;
        return true;
      }).slice(0, amount);

      // Discord can only bulk-delete messages younger than 14 days.
      const deletable = filtered.filter((m) => Date.now() - m.createdTimestamp < 14 * 86400000);
      const skipped = filtered.length - deletable.length;
      await interaction.channel.bulkDelete(deletable, true);

      let summary = `🧹 Deleted ${deletable.length} message(s).`;
      if (skipped > 0) summary += `\n⏭️ Skipped ${skipped} (older than 14 days can't be bulk-deleted).`;
      await interaction.editReply({ content: summary, flags: MessageFlags.Ephemeral });
      await modlog.log(interaction.guild, { title: '🧹 Purge', description: `**Channel:** <#${interaction.channelId}>\n**Deleted:** ${deletable.length}\n**By:** ${interaction.user.tag}`, color: 0x95A5A6 });
    } catch (e) {
      logger.error('[purge]', e.message);
      await interaction.editReply({ content: `⚠️ Couldn't purge: ${e.message}`, flags: MessageFlags.Ephemeral });
    }
  },
};
