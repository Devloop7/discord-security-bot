// src/commands/warnings.js
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const cases = require('../core/cases');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warnings').setDescription("View a user's warnings and mod notes")
    .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true)),
  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const all = cases.list(user.id);
    if (all.length === 0) {
      return interaction.reply({ content: `${user.tag} has a clean record. ✅`, flags: MessageFlags.Ephemeral });
    }
    const lines = all.slice(-20).map((c) => {
      const icon = c.type === 'warn' ? '⚠️' : '📝';
      const when = `<t:${Math.floor(c.ts / 1000)}:R>`;
      return `${icon} **#${c.id}** ${c.type} • by <@${c.modId}> • ${when}\n┕ ${c.reason}`;
    });
    const embed = new EmbedBuilder()
      .setTitle(`Record for ${user.tag}`)
      .setDescription(lines.join('\n'))
      .setColor(0xF1C40F)
      .setFooter({ text: `${cases.warnings(user.id).length} warning(s), ${all.length} total case(s)` });
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
