// src/tickets/panel.js — build + post the ticket creation panel.
'use strict';

const { buildPanelEmbed } = require('./embeds');
const { panelComponents } = require('./constants');

/**
 * postPanel(channel, cfg) → Promise<Message>
 * Posts the premium panel embed + Create Ticket button to the given channel.
 */
async function postPanel(channel, cfg) {
  return channel.send({
    embeds: [buildPanelEmbed(channel, cfg)],
    components: panelComponents(cfg.buttonLabel),
  });
}

module.exports = { buildPanelEmbed, postPanel };
