// src/tickets/log.js — emit structured embeds to the configured ticket log channel.
const { EmbedBuilder } = require('discord.js');
const { LOG_COLORS } = require('./constants');
const { getConfig } = require('../core/ticketStore');
const logger = require('../core/logger');

const EVENT_TITLES = {
  open:     'Ticket Created',
  close:    'Ticket Closed',
  delete:   'Ticket Deleted',
  claim:    'Ticket Claimed',
  unclaim:  'Ticket Unclaimed',
  priority: 'Priority Updated',
  pin:      'Ticket Pinned',
  unpin:    'Ticket Unpinned',
  feedback: '⭐ Feedback Received',
};

/**
 * logTicketEvent(guild, type, { ticketNumber, fields })
 * Sends a log embed to the guild's configured logChannelId.
 * Silent if no channel configured. Never throws.
 *
 * @param {Guild} guild
 * @param {string} type  — key in EVENT_TITLES / LOG_COLORS
 * @param {{ ticketNumber?: string, fields?: {name:string,value:string,inline?:boolean}[] }} opts
 */
async function logTicketEvent(guild, type, { ticketNumber, fields = [] } = {}) {
  try {
    const cfg = getConfig(guild.id);
    if (!cfg.logChannelId) return;

    const channel = guild.channels.cache.get(cfg.logChannelId)
      ?? await guild.channels.fetch(cfg.logChannelId).catch(() => null);
    if (!channel) return;

    const color = LOG_COLORS[type] ?? 0x5865F2;
    const title = EVENT_TITLES[type] ?? type;

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(title)
      .setFooter({ text: 'Security Bot Ticketing' })
      .setTimestamp();

    if (ticketNumber) embed.setDescription(`Ticket **#${ticketNumber}**`);
    if (fields.length) embed.addFields(fields);

    await channel.send({ embeds: [embed] });
  } catch (e) {
    logger.error('[ticket:log]', e.message);
  }
}

module.exports = { logTicketEvent };
