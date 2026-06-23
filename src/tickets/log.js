// src/tickets/log.js — emit branded ticket-event embeds to the log channel.
'use strict';

const { LOG_COLORS } = require('./constants');
const { baseEmbed, EMOJI, COLORS } = require('../ui/theme');
const { getConfig } = require('../core/ticketStore');
const logger = require('../core/logger');

const EVENT = {
  open:       { title: 'Ticket Created',      icon: EMOJI.ticket },
  close:      { title: 'Ticket Closed',       icon: EMOJI.close },
  reopen:     { title: 'Ticket Reopened',     icon: EMOJI.reopen },
  delete:     { title: 'Ticket Deleted',      icon: EMOJI.delete },
  claim:      { title: 'Ticket Claimed',      icon: EMOJI.claim },
  unclaim:    { title: 'Ticket Unclaimed',    icon: EMOJI.unclaim },
  priority:   { title: 'Priority Updated',    icon: EMOJI.priority },
  feedback:   { title: 'Feedback Received',   icon: EMOJI.star },
  adduser:    { title: 'Member Added',        icon: EMOJI.addUser },
  removeuser: { title: 'Member Removed',      icon: EMOJI.removeUser },
  transcript: { title: 'Transcript Generated',icon: EMOJI.transcript },
  pin:        { title: 'Ticket Pinned',       icon: EMOJI.pin },
  unpin:      { title: 'Ticket Unpinned',     icon: EMOJI.pin },
};

/**
 * logTicketEvent(guild, type, { ticketNumber, fields })
 * Sends a branded log embed to the configured logChannelId. Never throws.
 */
async function logTicketEvent(guild, type, { ticketNumber, fields = [] } = {}) {
  try {
    const cfg = getConfig(guild.id);
    if (!cfg.logChannelId) return;
    const channel = guild.channels.cache.get(cfg.logChannelId)
      ?? await guild.channels.fetch(cfg.logChannelId).catch(() => null);
    if (!channel) return;

    const meta = EVENT[type] || { title: type, icon: EMOJI.info };
    const color = LOG_COLORS[type] ?? COLORS.brand;

    const embed = baseEmbed(guild, { color }).setTitle(`${meta.icon}  ${meta.title}`);
    if (ticketNumber) embed.setDescription(`Ticket **#${ticketNumber}**`);
    if (fields.length) embed.addFields(fields);

    await channel.send({ embeds: [embed] });
  } catch (e) {
    logger.error('[ticket:log]', e.message);
  }
}

module.exports = { logTicketEvent };
