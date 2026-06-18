// src/core/modlog.js
const { EmbedBuilder } = require('discord.js');
const config = require('../../config');

// Sends a standardized embed to the mod-log channel. Never throws.
async function log(guild, { title, description, color = 0xE67E22, ping = false }) {
  try {
    const channel = guild.channels.cache.get(config.modLogChannelId);
    if (!channel) return;
    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor(color)
      .setTimestamp();
    const content = ping && config.alertRoleId ? `<@&${config.alertRoleId}>` : undefined;
    await channel.send({ content, embeds: [embed] });
  } catch (err) {
    console.error('[modlog] failed:', err.message);
  }
}

module.exports = { log };
