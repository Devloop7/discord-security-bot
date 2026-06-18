# Discord Security Bot — Design Spec

**Date:** 2026-06-18
**Status:** Draft for review
**Stack:** Node.js + discord.js v14 (modular, event-driven)
**Goal:** A maximally reliable Discord security bot that defends against malicious
links, server nuking, raids, spam, and bad language — with reversible,
fully-logged actions.

---

## 1. Overview

The bot watches every relevant gateway event and runs each through a focused
protection module. Every action it takes is reported to a **mod-log channel** and
recorded in **persistent JSON storage**, so nothing is silent or irreversible.
All thresholds, word lists, and whitelists live in a single editable `config.js`.

Secrets (bot token) live only in a git-ignored `.env` file and are never
committed or shared.

---

## 2. Feature set (locked)

### Core protections
| System | Trigger (default) | Action |
|--------|-------------------|--------|
| **Profanity filter** | Message matches wordlist after normalization (leetspeak, spacing, repeats — e.g. `f.u.c.k`, `sh1t`, `fuuuck`) | Delete + alert user → **escalating timeout**: 5 min → 1 h → 1 day. No auto-ban. |
| **Link protection (members)** | Any link posted by a non-trusted member | Delete + alert. **2 link strikes → ban.** |
| **Link protection (trusted roles)** | Link from a configured admin/mod role | Allowed. |
| **Known scam/phishing link** | Link domain in scam blocklist (incl. IP-grabbers like grabify/iplogger) | **Instant ban.** |
| **Discord invite link** | `discord.gg/...` (and variants) from a member | Counts as a link strike. |
| **Anti-nuke** | One non-whitelisted user performs **3+ destructive actions within 10 s** (channel create/delete, mass ban/kick, role delete) | **Strip all their roles → alert owner + admins → ban them.** Executor identified via audit log. |
| **Anti-raid** | **10+ joins within 30 s**; during a spike, accounts younger than 7 days are treated as raiders | **Lockdown**: quarantine/kick new joiners, raise server verification level, alert. Auto-lifts after a quiet period. |

### Added modules
| System | Trigger (default) | Action |
|--------|-------------------|--------|
| **Flood spam** | 5+ messages within 3 s from one user | Delete burst + **timeout (mute)** + alert. |
| **Mass-mention block** | `@everyone`/`@here` from a non-trusted member, or **5+ user/role mentions** in one message | Delete + alert; repeated → timeout. |
| **Anti-bot-add** | A bot is added by a user **not** on the trust list (audit log `botAdd`) | **Kick the bot** + alert owner. |
| **Permission-grant watch** | A role is granted **Administrator** or other dangerous permissions (ban/kick/manage-server/manage-roles/manage-channels/manage-webhooks) | **Auto-revert** the change + alert; treated as a nuke signal. |
| **Webhook protection** | Webhook created/modified by a non-whitelisted user | **Delete the webhook** + alert (and feed into anti-nuke counter). |

### Moderation tools
- **Slash commands:** `/warn`, `/ban`, `/kick`, `/mute`, `/unmute`, `/strikes`,
  `/unban`, `/lockdown`, `/unlock`, `/raidmode`, `/whitelist`, `/config`.
  All restricted to mods (configurable role / Discord permission).
- **Panic / lockdown button:** `/lockdown` (or `/panic`) instantly removes
  send-message permission from `@everyone` across all text channels; `/unlock`
  restores. Used during an active attack.

### Explicitly out of scope (easy to add later)
Caps/emoji spam, duplicate-message spam, standalone always-on account-age gate,
verification/captcha gate, username/avatar filtering, server backup & restore,
dangerous-file (.exe) blocking, full message-edit/delete audit logging,
DM-on-action notices.

---

## 3. Whitelisting model (critical)

Two **separate** allowlists, because they protect against different things:

1. **Link whitelist** — `linkAllowedRoles`, `linkAllowedDomains`,
   `linkAllowedChannels`. Members with these roles (or links to these domains, or
   posts in these channels) may post links freely.
2. **Anti-nuke whitelist** — `trustedUsers`: a short, *explicit* list of user IDs
   (server owner, co-owner). **Everyone else — including Administrators — is
   subject to anti-nuke, permission-watch, webhook, and bot-add protection.**
   This is the key design decision: a nuke almost always comes *from* a
   compromised or rogue admin, so "trusted = has admin perms" would defeat the
   whole purpose. The server owner is always implicitly trusted; the bot never
   actions itself.

---

## 4. Architecture

```
discordbtot/
├── .env                    # BOT_TOKEN, APP_ID  (git-ignored)
├── .env.example            # template (committed)
├── config.js               # ALL thresholds, lists, IDs — the one file users edit
├── index.js                # client + intents, loads events & modules, registers commands
├── package.json
├── src/
│   ├── core/
│   │   ├── store.js         # tiny JSON read/write helper (atomic writes)
│   │   ├── strikes.js       # per-user strike/timeout history, persisted
│   │   ├── modlog.js        # formats + sends embeds to the mod-log channel; pings alert role
│   │   ├── auditlog.js      # fetch the executor of a guild event from the audit log
│   │   └── whitelist.js     # link-whitelist + anti-nuke-trust checks
│   ├── protection/
│   │   ├── profanity.js     # messageCreate
│   │   ├── links.js         # messageCreate
│   │   ├── spam.js          # messageCreate (flood + mass-mention)
│   │   ├── antinuke.js      # channel/role/ban/kick events + permission-grant watch
│   │   ├── webhooks.js      # webhooksUpdate
│   │   ├── antibot.js       # guildMemberAdd (bot accounts)
│   │   └── antiraid.js      # guildMemberAdd (join-flood + lockdown)
│   ├── commands/            # one file per slash command + a loader
│   └── data/                # static lists: scam-domains.json, badwords.json
└── data/                    # runtime JSON (strikes.json) — auto-created, git-ignored
```

**Storage choice:** plain JSON files (no database). Avoids native-module
compilation pain on Windows and is sufficient for a single server. Swappable for
SQLite later if needed.

---

## 5. Gateway intents & permissions

**Privileged intents (must be enabled in the Developer Portal):**
`MessageContent` (to read messages for filtering), `GuildMembers` (joins/raids).

**Other intents:** `Guilds`, `GuildMessages`, `GuildModeration` (bans),
`GuildWebhooks`.

**Bot permissions (invite scope `bot applications.commands`):**
View Channels, Send Messages, Manage Messages, Manage Roles, Manage Channels,
Kick Members, Ban Members, Moderate Members (timeout), Manage Webhooks,
View Audit Log.

> The bot's own role must sit **above** the roles it needs to manage/strip,
> or Discord will reject the action. Noted in the setup walkthrough.

---

## 6. Configuration (`config.js`) — shape

```js
module.exports = {
  guildId: "",            // your server ID
  modLogChannelId: "",    // where actions are reported
  alertRoleId: "",        // pinged on nuke/raid/critical events
  trustedUsers: [],       // anti-nuke allowlist (you + co-owner) — explicit IDs

  link: {
    allowedRoles: [],     // roles allowed to post links
    allowedChannels: [],  // channels where links are allowed
    allowedDomains: [],   // e.g. ["youtube.com","tenor.com"]
    strikesToBan: 2,
    blockInvites: true,
  },
  profanity: { timeoutSteps: ["5m","1h","1d"] },
  spam: { maxMessages: 5, perSeconds: 3, maxMentions: 5, muteMinutes: 10 },
  antinuke: { maxActions: 3, perSeconds: 10, punishment: "ban" },
  antiraid: { maxJoins: 10, perSeconds: 30, minAccountAgeDays: 7, lockMinutes: 10 },
  mods: { roleId: "" },   // who may use slash commands
};
```

Word/scam lists ship as editable JSON in `src/data/` (a solid starter English
profanity list + a curated scam/IP-grabber domain list).

---

## 7. Error handling & reliability

- **Fail-safe, not fail-open:** any module error is caught and logged to the
  mod-log; one module crashing never takes down the bot.
- **Permission/role-hierarchy errors** are caught and reported clearly (e.g.
  "couldn't ban X — my role is below theirs").
- **Audit-log races:** anti-nuke fetches the audit log with a short retry, since
  the entry can lag the event by a moment.
- **Rate-limit aware:** bulk actions (lockdown, mass quarantine) are throttled to
  respect Discord's API limits.
- **Restart-safe:** strikes persist to disk; in-memory rate windows simply reset
  on restart (acceptable — they're short-lived by nature).
- **Self-protection:** the bot never actions the server owner, itself, or other
  bots it shouldn't, and ignores its own messages.

---

## 8. Testing approach

- **Unit-test the pure logic** (no Discord calls): leetspeak normalization +
  profanity match, link/domain extraction & whitelist decision, rate-window
  counters for spam/raid/nuke, strike escalation. Run with Node's built-in test
  runner — no heavy framework.
- **Manual integration checklist** on a private throwaway test server: post a
  bad word, post a link as member vs. trusted role, trigger flood, mass-mention,
  rapid channel deletes (anti-nuke), add a bot, grant Administrator, join-flood
  simulation, and each slash command. Documented as a checklist in the repo.

---

## 9. Build phases

1. **Foundation** — scaffold, `package.json`, `.env(.example)`, `config.js`,
   client + intents, `store`/`strikes`/`modlog`/`auditlog`/`whitelist` core.
2. **Message protections** — profanity, links.
3. **Spam protections** — flood→mute, mass-mention.
4. **Server shield** — anti-nuke, permission-grant watch, webhook protection,
   anti-bot-add (all audit-log driven).
5. **Anti-raid** — join-flood detection + lockdown/quarantine.
6. **Mod tools** — slash command framework + all commands + panic/lockdown.
7. **Setup & test** — Developer Portal walkthrough, invite link, test checklist.

Each phase ends with a runnable bot; later phases only add modules.

---

## 10. Setup walkthrough (delivered with Phase 7)

1. Create application → Bot at https://discord.com/developers (App ID is
   `1517206448424091738`).
2. **Reset & copy the Bot Token** → paste into local `.env` only.
3. Enable **Message Content** + **Server Members** privileged intents.
4. Generate invite URL (scopes `bot` + `applications.commands`, permissions as
   in §5), invite to server.
5. Move the bot's role near the top of the role list.
6. Fill in IDs in `config.js`; run `npm install` then `npm start`.
