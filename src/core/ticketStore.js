// src/core/ticketStore.js — JSON persistence for ticket config + records.
const store = require('./store');
const CONFIG_FILE = 'ticket-config.json';
const TICKETS_FILE = 'tickets.json';

const DEFAULTS = {
  panelChannelId: null, panelMessageId: null, panelMessage: null, buttonLabel: 'Create Ticket',
  categoryId: null, closedCategoryId: null, staffRoleId: null, logChannelId: null, transcriptChannelId: null,
  maxTicketsPerUser: 3, dmOnClose: true, enablePriority: true, counter: 0,
};

function allConfig() { return store.read(CONFIG_FILE, {}); }
function getConfig(guildId) { return { ...DEFAULTS, ...(allConfig()[guildId] || {}) }; }
function setConfig(guildId, patch) {
  const data = allConfig();
  data[guildId] = { ...DEFAULTS, ...(data[guildId] || {}), ...patch };
  store.write(CONFIG_FILE, data);
  return data[guildId];
}
function nextCounter(guildId) {
  const data = allConfig();
  const cur = { ...DEFAULTS, ...(data[guildId] || {}) };
  cur.counter = (cur.counter || 0) + 1;
  data[guildId] = cur;
  store.write(CONFIG_FILE, data);
  return String(cur.counter).padStart(3, '0');
}

function allTickets() { return store.read(TICKETS_FILE, {}); }
function getTicket(channelId) { return allTickets()[channelId] || null; }
function createTicket(channelId, fields) {
  const data = allTickets();
  data[channelId] = {
    id: channelId, userId: null, guildId: null, createdAt: Date.now(), status: 'open',
    claimedBy: null, claimedAt: null, priority: 'none', reason: '',
    closedBy: null, closedAt: null, closeReason: null,
    feedback: { rating: null, submittedAt: null, comment: null, commentSubmittedAt: null },
    ...fields,
  };
  store.write(TICKETS_FILE, data);
  return data[channelId];
}
function updateTicket(channelId, patch) {
  const data = allTickets();
  if (!data[channelId]) return null;
  data[channelId] = { ...data[channelId], ...patch };
  store.write(TICKETS_FILE, data);
  return data[channelId];
}
function deleteTicketRecord(channelId) {
  const data = allTickets();
  delete data[channelId];
  store.write(TICKETS_FILE, data);
}
function openCount(guildId, userId) {
  return Object.values(allTickets()).filter(
    (t) => t.guildId === guildId && t.userId === userId && t.status === 'open',
  ).length;
}
function clearGuild(guildId) {
  const data = allTickets();
  for (const id of Object.keys(data)) if (data[id].guildId === guildId) delete data[id];
  store.write(TICKETS_FILE, data);
  const cfg = allConfig();
  delete cfg[guildId];
  store.write(CONFIG_FILE, cfg);
}

module.exports = {
  getConfig, setConfig, nextCounter,
  getTicket, createTicket, updateTicket, deleteTicketRecord, openCount, clearGuild,
};
