// src/commands/note.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const cases = require('../core/cases');
const modlog = require('../core/modlog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('note').setDescription('Add a private mod note to a user')
    .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true))
    .addStringOption((o) => o.setName('text').setDescription('Note text').setRequired(true)),
  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const text = interaction.options.getString('text');
    const entry = cases.add(user.id, { type: 'note', modId: interaction.user.id, reason: text });
    await interaction.reply({ content: `📝 Note added to ${user.tag} (case #${entry.id}).`, flags: MessageFlags.Ephemeral });
    await modlog.log(interaction.guild, { title: '📝 Mod note added', description: `**User:** ${user.tag} (${user.id})\n**By:** ${interaction.user.tag}\n**Case:** #${entry.id}\n**Note:** ${text}`, color: 0x3498DB });
  },
};
