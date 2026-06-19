# Ticket System Implementation Plan

> **For agentic workers:** built with subagent-driven development; each chunk is implemented then reviewed. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A complete, TitanBot-style support-ticket system, rebuilt cleanly for this bot (discord.js v14, CommonJS, JSON storage — no PostgreSQL). Interactive `/ticket setup`, private ticket channels, claim/pin/priority/close/reopen/delete, HTML transcripts, full logging, per-user limits + rate limiting, and a star-rating feedback survey on close.

**Stack:** discord.js v14, CommonJS, Node built-in test runner, JSON persistence via existing `src/core/store.js`.

**Out of scope (per user):** the live interactive dashboard. Settings are configured via `/ticket setup` and changed via `/ticket config`.

---

## File structure

```
src/
├── core/
│   └── ticketStore.js     # JSON data layer: guild ticket-config + ticket records + counter + limit checks (TESTED)
├── tickets/
│   ├── constants.js       # colors, priority map, customIds, emojis, embed/button builders (TESTED: pure helpers)
│   ├── permissions.js     # canManageTicket / canCloseTicket checks (TESTED)
│   ├── panel.js           # build + post the ticket panel
│   ├── log.js             # logTicketEvent(guild, type, fields) → ticket log channel
│   ├── transcript.js      # generateHtml(channel) → { buffer, filename }
│   ├── actions.js         # openTicket / claim / unclaim / pin / setPriority / close / reopen / deleteTicket
│   ├── feedback.js        # feedback survey DM + rating/comment handlers
│   └── interactions.js    # register(client): routes ticket buttons & modals via InteractionCreate
└── commands/
    └── ticket.js          # /ticket (subcommands: setup, config, close, claim, priority)
```

Runtime data files (git-ignored under `/data/`): `ticket-config.json`, `tickets.json`.

---

## Data model

**`ticket-config.json`** — keyed by guildId:
```js
{
  "<guildId>": {
    panelChannelId, panelMessageId, panelMessage, buttonLabel,
    categoryId, closedCategoryId, staffRoleId, logChannelId, transcriptChannelId,
    maxTicketsPerUser /* default 3 */, dmOnClose /* default true */,
    enablePriority /* default true */, counter /* int, default 0 */
  }
}
```

**`tickets.json`** — keyed by channelId:
```js
{
  "<channelId>": {
    id, userId, guildId, createdAt /* ms */, status /* 'open'|'closed' */,
    claimedBy, claimedAt, priority /* 'none'|'low'|'medium'|'high'|'urgent' */,
    reason, closedBy, closedAt, closeReason,
    feedback: { rating, submittedAt, comment, commentSubmittedAt }
  }
}
```

---

## Shared constants & customIds (exact — all chunks must use these)

Button/modal customIds (split on `:` → `[name, ...args]`):
- Panel: `create_ticket`
- Open modal: `create_ticket_modal`
- Controls: `ticket_claim`, `ticket_unclaim`, `ticket_pin`, `ticket_close`, `ticket_priority:<level>`
- Close modal: `ticket_close_modal`
- Closed-state: `ticket_reopen`, `ticket_delete`
- Feedback: `ticket_feedback:<guildId>:<channelId>:<1-5>`, `ticket_feedback_comment:<guildId>:<channelId>`, `ticket_feedback_decline:<guildId>:<channelId>`, modal `ticket_feedback_comment_modal:<guildId>:<channelId>`

Priority map (emoji/label/color): none ⚪ #95A5A6 · low 🟢 #2ECC71 · medium 🟡 #F1C40F · high 🔴 #E74C3C · urgent 🚨 #E91E63.

Colors: info #3498DB, open #2ECC71, closed #E74C3C, claim #2ECC71, unclaim #F39C12, reopen #2ECC71.

Log event colors: open 0x5865F2, close 0xED4245, delete 0x8B0000, claim 0x5865F2, unclaim 0xFAA61A, priority 0x9B59B6, feedback 0x57F287.

---

## CHUNK 1 — Foundation: `ticketStore.js` + `constants.js` + `permissions.js` (TESTED)

### Task 1.1: `src/core/ticketStore.js`

**Files:** Create `src/core/ticketStore.js`; Test `test/ticketStore.test.js`

- [ ] **Step 1: Write failing test** `test/ticketStore.test.js`:
```js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
process.env.BOT_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'botticket-'));
const ts = require('../src/core/ticketStore');

test('config: defaults then set/merge per guild', () => {
  const def = ts.getConfig('g1');
  assert.strictEqual(def.maxTicketsPerUser, 3);
  assert.strictEqual(def.dmOnClose, true);
  assert.strictEqual(def.enablePriority, true);
  assert.strictEqual(def.counter, 0);
  ts.setConfig('g1', { staffRoleId: 'r1', maxTicketsPerUser: 5 });
  const c = ts.getConfig('g1');
  assert.strictEqual(c.staffRoleId, 'r1');
  assert.strictEqual(c.maxTicketsPerUser, 5);
  assert.strictEqual(c.dmOnClose, true); // unchanged default preserved
});

test('counter increments and pads to 3 digits', () => {
  assert.strictEqual(ts.nextCounter('g2'), '001');
  assert.strictEqual(ts.nextCounter('g2'), '002');
  assert.strictEqual(ts.getConfig('g2').counter, 2);
});

test('ticket records: create/get/update; open-count per user', () => {
  ts.createTicket('chA', { userId: 'u1', guildId: 'g3', reason: 'help', priority: 'none' });
  ts.createTicket('chB', { userId: 'u1', guildId: 'g3', reason: 'x', priority: 'none' });
  ts.createTicket('chC', { userId: 'u2', guildId: 'g3', reason: 'y', priority: 'none' });
  assert.strictEqual(ts.getTicket('chA').status, 'open');
  assert.strictEqual(ts.openCount('g3', 'u1'), 2);
  ts.updateTicket('chA', { status: 'closed', closedBy: 'm1' });
  assert.strictEqual(ts.getTicket('chA').status, 'closed');
  assert.strictEqual(ts.openCount('g3', 'u1'), 1);
});

test('deleteTicketRecord and clearGuild', () => {
  ts.deleteTicketRecord('chB');
  assert.strictEqual(ts.getTicket('chB'), null);
  ts.clearGuild('g3');
  assert.strictEqual(ts.getTicket('chC'), null);
});
```

- [ ] **Step 2:** Run `node --test test/ticketStore.test.js` → FAIL (module missing).

- [ ] **Step 3: Implement** `src/core/ticketStore.js`:
```js
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
```

- [ ] **Step 4:** Run test → PASS. **Step 5:** Commit `feat(tickets): add ticket JSON data layer with tests`.

### Task 1.2: `src/tickets/constants.js`

Create with the priority map, colors, customIds, and these builder functions (used by all later chunks — keep signatures stable):
- `PRIORITY` (object above), `COLORS`, `LOG_COLORS`.
- `controlRow({ claimed = false, enablePriority = true })` → `ActionRowBuilder` with buttons: Claim 🙋 (`ticket_claim`, Primary; if claimed → label "Claimed", Secondary, `setDisabled(true)`), Pin 📌 (`ticket_pin`, Secondary), Close 🔒 (`ticket_close`, Danger). If enablePriority, append Low 🟢 (`ticket_priority:low`, Secondary) and High 🔴 (`ticket_priority:high`, Danger).
- `closedRow()` → row with Reopen 🔓 (`ticket_reopen`, Success) + Delete 🗑️ (`ticket_delete`, Danger).
- `feedbackRows(guildId, channelId)` → two rows: five star buttons `ticket_feedback:<g>:<c>:<n>` labels "⭐ 1".."⭐ 5" (1-4 Secondary, 5 Primary); second row Add Comment ✍️ (`ticket_feedback_comment:<g>:<c>`, Secondary) + No thanks ❌ (`ticket_feedback_decline:<g>:<c>`, Secondary).
- `panelComponents(buttonLabel)` → row with `create_ticket` Primary 📩 button.

Add `test/ticketConstants.test.js` asserting: `PRIORITY.high.emoji === '🔴'`; `controlRow({claimed:true})` first button is disabled; `feedbackRows('g','c')` produces 2 rows and the customId of the first star is `ticket_feedback:g:c:1`. (Inspect via `.toJSON()`.)

Commit `feat(tickets): add ticket constants + UI builders with tests`.

### Task 1.3: `src/tickets/permissions.js`
```js
const { PermissionFlagsBits } = require('discord.js');
const { getConfig } = require('../core/ticketStore');

// Staff = has Manage Channels, or has the configured staff role.
function isStaff(member, guildId) {
  if (!member) return false;
  if (member.permissions?.has?.(PermissionFlagsBits.ManageChannels)) return true;
  const staffRoleId = getConfig(guildId).staffRoleId;
  return !!staffRoleId && member.roles.cache.has(staffRoleId);
}
function canManageTicket(member, guildId) { return isStaff(member, guildId); }
function canCloseTicket(member, guildId, ticket) {
  return isStaff(member, guildId) || (ticket && member?.id === ticket.userId);
}
module.exports = { isStaff, canManageTicket, canCloseTicket };
```
Add `test/ticketPermissions.test.js` with fake members (Manage Channels true/false, role present/absent, opener) covering each path. Commit `feat(tickets): add ticket permission helpers with tests`.

---

## CHUNK 2 — Setup command + panel + logging

### Task 2.1: `src/tickets/panel.js`
- `buildPanelEmbed(cfg)` → EmbedBuilder title "Support Tickets", description `cfg.panelMessage`, color info.
- `async postPanel(channel, cfg)` → sends `{ embeds:[buildPanelEmbed], components:[panelComponents(cfg.buttonLabel)] }`, returns the message.

### Task 2.2: `src/tickets/log.js`
- `async logTicketEvent(guild, type, { ticketNumber, fields })` → reads `getConfig(guild.id).logChannelId`, builds an embed with `LOG_COLORS[type]`, a title per the event table, the given fields, footer "Security Bot Ticketing", timestamp; sends to the log channel. Never throws (wrap in try/catch → `logger.error`).

### Task 2.3: `src/commands/ticket.js` — `/ticket setup` and `/ticket config`
Single command `ticket` with subcommands. Set `bypassModGate = true` on the export (see Chunk 5 dispatcher change) and self-check `ManageChannels`/`ManageGuild` inside.
- `setup` options: `panel_channel` (channel, required), `panel_message` (string, required), `button_label` (string), `category` (channel, ChannelType Category), `closed_category` (channel), `staff_role` (role), `log_channel` (channel), `transcript_channel` (channel), `max_tickets` (int 1-10), `dm_on_close` (bool), `enable_priority` (bool). Saves via `setConfig`, auto-creates a "Tickets" category if none given, posts the panel via `postPanel`, stores `panelChannelId`/`panelMessageId`. Replies ephemerally with a summary.
- `config` options: same fields, all optional — patches only provided ones via `setConfig`; if `panel_message`/`button_label` changed and a panel exists, edit the panel message. Ephemeral confirm.

Commit `feat(tickets): add setup/config command, panel, and logging`.

---

## CHUNK 3 — Open flow + in-ticket controls

### Task 3.1: `src/tickets/actions.js` (part 1)
Implement and export async functions (each does Discord work + updates `ticketStore` + logs):
- `openTicket(interaction, reason)`: re-check `openCount < maxTicketsPerUser`; `nextCounter`; create channel type GuildText named `ticket-NNN` (prefix priority emoji only if non-none later), parent = `categoryId` (auto-find/create "Tickets" if missing), permission overwrites: `@everyone` deny ViewChannel; opener allow View/Send/AttachFiles/ReadMessageHistory; staffRole (if set) same. `createTicket` record. Send welcome embed (title `Ticket #NNN`, desc with reason + priority, fields Status 🟢 Open / Claimed By "Not claimed" / Created `<t:unix:R>`, color = priority color) with `controlRow`, then `.pin()`. Content pings opener + staff role. Log `open`. Reply ephemerally with a link to the channel.
- `claim(interaction)` / `unclaim(interaction)`: permission `canManageTicket`; update record; edit welcome embed "Claimed By"; rebuild control row (claimed state); post claim/unclaim status embed; log.
- `pin(interaction)`: toggle `📌 ` prefix on channel name + position; ephemeral confirm; log pin/unpin.
- `setPriority(interaction, level)`: permission `canManageTicket`; update record; rename channel with new priority emoji prefix; edit welcome embed priority line + color; post status embed; log priority.

Follow the TitanBot spec for exact embed text/colors/labels.

Commit `feat(tickets): add open + claim/unclaim/pin/priority actions`.

### Task 3.2: wire open-side interactions in `src/tickets/interactions.js`
`register(client)` listens to `Events.InteractionCreate`:
- `isButton()`: route `create_ticket` → show `create_ticket_modal` (after rate-limit + open-count checks); `ticket_claim/unclaim/pin` → actions; `ticket_priority:<lvl>` → setPriority; (`ticket_close`/`ticket_reopen`/`ticket_delete`/feedback handled in later chunks — add their routes now as stubs calling Chunk-4/5 functions once they exist).
- `isModalSubmit()`: `create_ticket_modal` → `openTicket(interaction, reason)`.
Rate limit: in-memory `Map`, key `${userId}:create_ticket`, max 3 / 60s.
Wrap every handler in try/catch → `logger.error`.

Commit `feat(tickets): route open/claim/pin/priority interactions`.

---

## CHUNK 4 — Close / reopen / delete / transcript

### Task 4.1: `src/tickets/transcript.js`
`async generateHtml(channel)` → fetch all messages (paginate 100s), sort chronological, build a dark Discord-style HTML table (Timestamp UTC, Author, Message; HTML-escape everything; embeds/attachments → `[embed]`/`[attachment]`), return `{ buffer: Buffer.from(html,'utf8'), filename: \`ticket-${channel.id}.html\` }`.

### Task 4.2: `src/tickets/actions.js` (part 2)
- `close(interaction, reason)`: permission `canCloseTicket`; update record closed; move to `closedCategoryId` if set; revoke opener View/Send; edit welcome embed Status → 🔴 Closed + color closed + strip control buttons; send close status embed with `closedRow()`; if `dmOnClose` DM opener + send feedback survey (Chunk 5); log close.
- `reopen(interaction)`: permission `canManageTicket`; status→open; move back to `categoryId`; restore opener perms; edit welcome Status → 🟢 Open + re-enable claim; edit close-status message → "Ticket Reopened"; log (reuse open color/claim).
- `deleteTicket(interaction)`: permission `canManageTicket`; send "deleting in 3s" embed; after 3000ms → `generateHtml`, send transcript file + embed to `transcriptChannelId`, `channel.delete()`; keep the record (do NOT delete record); log delete.

### Task 4.3: route close/modal/reopen/delete in `interactions.js`
- Button `ticket_close` → show `ticket_close_modal`. Modal `ticket_close_modal` → `close(interaction, reason || default)`.
- `ticket_reopen` → reopen. `ticket_delete` → deleteTicket.

Commit `feat(tickets): add close/reopen/delete + HTML transcripts`.

---

## CHUNK 5 — Feedback survey + command/permission wiring + index registration

### Task 5.1: `src/tickets/feedback.js`
- `async sendSurvey(user, guildId, channelId)`: DM the opener a "How was your support experience?" embed + `feedbackRows`.
- Handlers: `submitRating(interaction, g, c, n)` (only opener; one rating per ticket; save `feedback.rating`; log feedback), `openCommentModal`, `saveComment(interaction, g, c)` (modal), `declineFeedback(interaction)`.
- Route all `ticket_feedback*` buttons + `ticket_feedback_comment_modal` in `interactions.js`.

### Task 5.2: `/ticket` subcommands `close`, `claim`, `priority`
Add to `src/commands/ticket.js`: `close [reason]`, `claim`, `priority <level>` — each verifies it's run inside a ticket channel (`getTicket(interaction.channelId)`), checks permission, and calls the matching action. `bypassModGate = true`.

### Task 5.3: dispatcher + index wiring
- In `src/commands/index.js`: register `require('./ticket')` in `commandModules`; modify the dispatcher so a command with `bypassModGate === true` skips the global `isMod` gate (the command does its own checks).
- In root `index.js`: add `require('./src/tickets/interactions')` to the `modules` array.
- Update `README.md`: document the ticket system + commands.
- **Update the invite link permissions** in README to also include **Embed Links** (16384), **Attach Files** (32768), and **Read Message History** (65536) — required for ticket embeds, transcript upload, and reading messages. New value: `1100317060246`.

Commit `feat(tickets): feedback survey + ticket commands + wiring + invite perms`.

---

## CHUNK 6 — Verify

- [ ] `npm test` (all prior + new ticket tests pass).
- [ ] Sanity-load: `node -e "require('./src/tickets/interactions'); require('./src/commands'); console.log('ok')"`.
- [ ] `node -e "process.env.DISCORD_TOKEN='x'; require('./index.js'); setTimeout(()=>{console.log('LOADED_OK');process.exit(0)},700)"`.
- [ ] Final review subagent over the whole ticket system (spec fidelity + v14 correctness + permission model + no double-reply/double-defer on interactions + transcript safety).
- [ ] Update `docs/TEST-CHECKLIST.md` with ticket manual tests.

## Self-review notes
- Every interaction handler must `reply`/`update`/`showModal` exactly once; use ephemeral for errors.
- Ticket buttons bypass the command mod-gate; permission is enforced per-action via `permissions.js`.
- Records persist after channel deletion (for stats/feedback); only `/ticket` "delete system" (if added later) bulk-clears.
- Bot needs Manage Channels + Manage Roles (perm overwrites), Embed Links, Attach Files, Read Message History.
