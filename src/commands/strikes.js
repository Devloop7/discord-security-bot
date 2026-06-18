// src/commands/strikes.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const strikes = require('../core/strikes');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('strikes').setDescription("Show a user's strikes")
    .addUserOption((o) => o.setName('user').setDescription('Target user').setRequired(true)),
  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const s = strikes.get(user.id);
    await interaction.reply({ content: `**${user.tag}** — link: ${s.link}, profanity: ${s.profanity}`, flags: MessageFlags.Ephemeral });
  },
};
