// src/tickets/panel.js — build and post the ticket panel embed.
const { EmbedBuilder } = require('discord.js');
const { COLORS, panelComponents } = require('./constants');

/**
 * buildPanelEmbed(cfg) → EmbedBuilder
 * Title: "Support Tickets", description: cfg.panelMessage, color: COLORS.info
 */
function buildPanelEmbed(cfg) {
  return new EmbedBuilder()
    .setTitle('Support Tickets')
    .setDescription(cfg.panelMessage || 'Click the button below to open a support ticket.')
    .setColor(COLORS.info);
}

/**
 * postPanel(channel, cfg) → Promise<Message>
 * Sends the panel embed + button row to the given channel, returns the sent message.
 */
async function postPanel(channel, cfg) {
  return channel.send({
    embeds: [buildPanelEmbed(cfg)],
    components: [panelComponents(cfg.buttonLabel)],
  });
}

module.exports = { buildPanelEmbed, postPanel };
