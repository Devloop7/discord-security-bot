# Carl-bot Feature Parity — Design Spec

**Date:** 2026-06-22
**Decision:** Extend the existing JavaScript/CommonJS bot (discord.js v14, JSON + Railway Volume).
**Explicitly rejected:** Full rewrite to TypeScript + PostgreSQL + Prisma + Docker + dashboard + 100k-server scale.
Rationale: ~60 working/tested files + 76 unit tests + the just-configured Railway Volume already cover most of
the requested moderation/automod/welcome surface. We add only what is genuinely missing, on the proven stack,
with zero risk to the deployed bot.

Dashboard is **deferred** (user choice). PostgreSQL/Prisma are **not** introduced — persistence stays JSON via
`store` on the mounted `/data` volume.

---

## Non-negotiable standards (every command/event/module)

Carried from the existing codebase + the user's explicit "no placeholders" requirement:

1. **No placeholders / TODOs / mocks.** Every feature fully implemented and wired.
2. **Error handling.** Every command body wrapped; the dispatcher already catches and replies on throw. Event
   listeners wrap their bodies in try/catch and `logger.error('[module]', e.message)` — one bad event never crashes.
3. **Permission validation.** Mutating commands go through the default mod-gate (see dispatcher) and, for
   member-targeting actions, `modguard.checkActable(...)`. Public commands set `bypassModGate: true`.
4. **Rate limiting.** Abusable commands (purge, poll, suggest) and per-message automod use `RateWindow`.
5. **Logging.** Mod actions → `modlog.log(guild, {...})`. Event logs → the new logging module (Phase D).
6. **Persistence.** All state via `store.read/write/mutate` (JSON on the volume) or `guildConfig.get/set`.
7. **Audit trail.** Member-affecting actions pass a `reason` to the Discord API (shows in the server audit log)
   and record a `cases` entry where a moderation record is warranted.
8. **Slash commands.** All user-facing commands are slash commands via `SlashCommandBuilder`, registered through
   the existing `commandModules` array → auto-registered on startup.
9. **Modern API.** discord.js v14 builders, `MessageFlags.Ephemeral` (no deprecated `ephemeral: true`),
   components v2 (buttons/select menus), `interaction` lifecycle acknowledged exactly once.

---

## Infra contracts (reuse — do NOT reinvent)

| Module | API | Use for |
|---|---|---|
| `src/core/store.js` | `read(name, fb)`, `write(name, data)`, `mutate(name, fn, fb)`, `dataDir()` | JSON persistence; `mutate` for concurrent-safe writes |
| `src/core/guildConfig.js` | `get(guildId)`, `set(guildId, patch)` (deep-merge), `DEFAULTS` | per-guild settings |
| `src/core/scheduler.js` | `register(type, fn(data, client))`, `schedule(type, runAt, data)→jobId`, `cancel(id)`, `hasJob`, `jobs` | durable timers (temp-ban/mute lift), survive restarts |
| `src/core/modlog.js` | `log(guild, { title, description, color?, ping? })` | standardized mod-log embeds |
| `src/core/modguard.js` | `checkActable({ interaction, target, action })→{ ok, reason }` | hierarchy/self/owner/bot guards |
| `src/core/cases.js` | `add(userId, {type, modId, reason})`, `list`, `warnings`, `clear`, `remove` | persistent mod records |
| `src/core/perms.js` | `isStaff(member, guildId)` | staff check (ManageGuild ∪ staffRoleIds ∪ mods.roleId) |
| `src/core/escalate.js` | `parseDuration('10m'\|'1h'\|'2d')→ms`, `nextTimeout(offense, steps)→ms` | duration parsing + escalation |
| `src/core/ratewindow.js` | `new RateWindow(ms)`, `record(key)→count`, `reset(key)` | sliding-window rate limits |
| `src/core/strikes.js` | `add(userId, type, decayMs)`, `get`, `reset` | offense counters with decay |
| `src/core/logger.js` | `error/warn/info/debug` | leveled logging |

**Command shape:** `module.exports = { data: SlashCommandBuilder, execute(interaction), bypassModGate? }`.
Add each new command's module to the `commandModules` array in `src/commands/index.js`.

**Event module shape:** `module.exports = { register(client) }` that attaches `client.on(Events.X, ...)`.
Add each new event module to the `modules` array in `index.js`. Scheduler handlers are registered inside a
module's `register(client)` via `scheduler.register(type, fn)`.

**Dispatcher gate (existing):** non-`bypassModGate` commands require `ManageGuild` or `config.mods.roleId`.
Public commands (info/avatar/poll/suggest) set `bypassModGate: true`.

**A shared `src/core/duration.js` helper** already partially exists as `escalate.parseDuration` (supports m/h/d).
Phase A extends parsing to accept weeks (`w`) and compound values by adding `parseDurationLong()` in a new
`src/core/duration.js` (does not modify `escalate.js`, which automod depends on).

---

## Phase A — Moderation completion

**New command files** (`src/commands/`), all added to `commandModules`:

- `tempban.js` — `/tempban user duration [reason] [delete_days]`. Bans, records a `cases` entry, schedules
  `scheduler.schedule('tempban-lift', runAt, {guildId, userId})`. Handler unbans. `delete_days` 0–7.
- `unban.js` — `/unban user_id [reason]`. Accepts a raw ID (target not in guild). Validates the ID is currently
  banned (`guild.bans.fetch`), unbans, mod-logs. Cancels any pending `tempban-lift` for that user.
- `softban.js` — `/softban user [reason] [delete_days=1]`. Ban (to purge messages) then immediate unban. Kicks
  the user out while deleting their recent messages; they can rejoin.
- `tempmute.js` — `/tempmute user duration [reason]`. Timeout for the parsed duration (clamped to Discord's
  28-day max). For durations > 28d, falls back to a muted-role + `scheduler` lift (role created/cached if absent).
  Initial scope: clamp to 28d via native timeout (simplest, reliable); document the clamp in the reply.
- `purge.js` — `/purge amount [user] [contains] [bots] [humans]`. Bulk-deletes 1–100 recent messages with
  optional filters. Uses `channel.bulkDelete` (skips >14-day-old messages, reports how many were skipped).
  Rate-limited per channel via `RateWindow`. Ephemeral summary.
- `slowmode.js` — `/slowmode seconds [channel]`. Sets `rateLimitPerUser` 0–21600. Mod-logged.
- `role.js` — `/role add|remove user role`. Adds/removes a role with hierarchy checks (bot's top role must be
  above the target role; invoker must outrank it unless owner). Mod-logged.
- `nick.js` — `/nick user [nickname]`. Sets or (empty) resets a member's nickname. Hierarchy-checked.

**Scheduler handlers** registered in a new `src/moderation/index.js` `register(client)`:
`tempban-lift` (unban), and (if muted-role path used) `tempmute-lift`.

**Persistence:** none beyond scheduler.json + cases.json. **Intents:** none new.
**Acceptance:** each command guarded, mod-logged, audit-reason passed; temp actions survive a restart (durable).

---

## Phase B — Utility & Info

**New command files**, all `bypassModGate: true` (public):

- `userinfo.js` — `/userinfo [user]`. Embed: tag, id, created-at, joined-at, roles, key permissions, boosting.
- `serverinfo.js` — `/serverinfo`. Embed: owner, created-at, member/bot/channel/role/emoji counts, boost tier,
  verification level.
- `roleinfo.js` — `/roleinfo role`. Embed: id, color, members, position, hoist/mentionable, key permissions.
- `channelinfo.js` — `/channelinfo [channel]`. Embed: type, id, topic, slowmode, NSFW, created-at.
- `avatar.js` — `/avatar [user]`. Full-size avatar (server + global), links to PNG/WEBP/GIF.
- `banner.js` — `/banner [user]`. Fetches `User` with `force:true` to get the banner; graceful "no banner".
- `membercount.js` — `/membercount`. Total / humans / bots.
- `poll.js` — `/poll question option1 option2 [option3..option5] [minutes]`. Posts an embed with up to 5 button
  options; tallies votes (one per user, switchable) in-memory + persisted to `polls.json`; closes on timer via
  `scheduler.schedule('poll-close', ...)` and edits the message with results. Rate-limited per user.
- `suggest.js` — `/suggest text`. Posts to the configured suggestions channel with 👍/👎 buttons + a thread;
  channel id in `guildConfig.suggestions.channelId`. A companion `/suggestions setup channel` (mod) configures it.
  Vote tallies persisted to `suggestions.json`. Rate-limited per user.

**New event/interaction module:** `src/utility/interactions.js` (`register(client)`) handles `poll:`/`suggest:`
button customIds. **Persistence:** `polls.json`, `suggestions.json`. **guildConfig:** add `suggestions:
{ channelId }`. **Intents:** none new.

---

## Phase C — Reaction Roles

`src/reactionroles/` with `index.js` (`register(client)` — interaction router for `rr:` customIds) and a command
`src/commands/reactionroles.js` (`/reactionroles`):

- `/reactionroles create channel "title" [color]` — posts an embed message; stores a group in
  `guildConfig.reactionRoles[messageId] = { channelId, groupId, mode, roles: [] }`.
- `/reactionroles add message_id role [label] [emoji]` — adds a role option (rebuilds the button/select rows).
- `/reactionroles remove message_id role`, `/reactionroles mode message_id normal|unique|verify`.
- **Modes:** `normal` (toggle, multi), `unique` (single from group — removes others), `verify` (grants one
  verification role, e.g. gates the server).
- **UI:** buttons for ≤5 roles, string select-menu for 6–25 (Discord limits). **Persistent:** roles re-grant
  correctly after restart because customIds encode `rr:<messageId>:<roleId>` and config is JSON-backed (no
  in-memory state needed).
- Hierarchy: bot must outrank each managed role (validated at add-time with a clear error).

**Persistence:** `guildConfig.reactionRoles` (already in DEFAULTS). **Intents:** none new (button/select based,
no message-reaction intent required).

---

## Phase D — Logging system

`src/logging/index.js` (`register(client)`) attaches listeners and routes each to a per-event configured channel.

**Events:** messageDelete, messageUpdate (edit), messageDeleteBulk, channelCreate, channelDelete, channelUpdate,
roleCreate, roleDelete, roleUpdate, guildMemberAdd (join), guildMemberRemove (leave), guildBanAdd, guildBanRemove,
guildMemberUpdate (nickname + role changes + timeout), voiceStateUpdate (join/leave/move/mute), inviteCreate +
invite-usage on join (Phase F supplies the cache; logging reads it), emojiCreate/Delete/Update,
stickerCreate/Delete/Update.

**Config:** extend `guildConfig.logging` to `{ channelId, events: { messageDelete: {enabled, channelId?}, ... } }`
— a master channel plus optional per-event channel overrides. Command `src/commands/logging.js` (`/logging`):
`/logging channel #ch` (master), `/logging toggle event on|off`, `/logging status`.

**Audit attribution:** ban/unban/role/channel/timeout logs use `auditlog.fetchExecutor(...)` (existing) to show
*who* did it. **Intents (new):** `GuildVoiceStates`, `GuildExpressions` (emoji/sticker). `GuildModeration`
(bans) and `GuildMembers` already enabled. **Partials:** add `Message`, `Reaction` so deletes of uncached
messages still fire. **Persistence:** guildConfig only.

---

## Phase E — Automod expansion

Extend protection with `src/protection/automod.js` (`register(client)` — single MessageCreate listener that runs
the enabled checks in order, short-circuiting on first action):

- **anti-caps** (% uppercase over min length), **anti-mention-spam** (N+ user/role mentions), **anti-mass-emoji**
  (N+ emoji), **anti-duplicate** (same content repeated within window — `RateWindow` keyed by author+hash),
  **anti-flood** (N messages in T seconds — already partly in spam.js; automod adds per-guild config),
  **regex filters** (admin-supplied patterns, validated + length-capped, executed with a timeout guard against
  catastrophic backtracking via simple length/`*+` heuristics), **NSFW-link list** (static domain list, same
  mechanism as scam-domains).
- **Escalation:** reuse `strikes` + `escalate.nextTimeout(count, steps)` — delete → warn → timeout-step → timeout-step.
  Per-guild `automod` config holds thresholds, enabled flags, and `timeoutSteps`.

**Config:** extend `guildConfig.automod` to a structured object (caps/mentions/emoji/dupText/flood/regexFilters/
nsfwLinks each with `{enabled, ...thresholds}`). Command `src/commands/automod.js` (`/automod`):
`/automod toggle module on|off`, `/automod set module key value`, `/automod addregex pattern`,
`/automod status`. **Persistence:** guildConfig + `data/nsfw-domains.json` (static, tracked). Whitelisted
roles/channels reuse `whitelist.canPostLinks`-style checks. **Intents:** none new (MessageContent already on).

---

## Phase F — Invite Tracker

`src/invites/index.js` (`register(client)`):

- On ready + `inviteCreate`/`inviteDelete`: maintain an in-memory cache of each guild's invite uses
  (`Map<guildId, Map<code, uses>>`), seeded from `guild.invites.fetch()`.
- On `guildMemberAdd`: diff the cache against a fresh fetch to find which invite incremented → attribute the
  inviter. Persist running totals to `invites.json` (`{ guildId: { inviterId: { real, fake, left, total } } }`).
  Vanity-URL and unknown fallbacks handled gracefully.
- Integrate with welcome: expose `getInviter(guildId, memberId)` so the welcome message can show "invited by X".
- Command `src/commands/invites.js` (`/invites [user]`) — shows a member's invite stats; `/invites leaderboard`.
  Mod `/invites setup channel` logs joins-with-inviter to a channel.

**Config:** `guildConfig.invites` (already in DEFAULTS) gains `logChannelId`. **Intents (new):** `GuildInvites`.
**Persistence:** `invites.json`.

---

## Phase G — Permission / Staff-Levels

Unify command authorization:

- Extend `guildConfig` with `permissions: { commandOverrides: { <command>: { allowedRoleIds[], deniedRoleIds[],
  disabled } }, staffLevels: { mod: [roleIds], admin: [roleIds] } }`.
- Replace the dispatcher's local `isMod` in `src/commands/index.js` with a shared `src/core/access.js`
  `canRun(member, commandName, guildId)` that layers: owner → ManageGuild → staffLevels/staffRoleIds →
  per-command overrides → default. Backward compatible (no config ⇒ current behavior).
- Command `src/commands/perms.js` (`/perms`): `/perms allow command role`, `/perms deny command role`,
  `/perms disable command`, `/perms level mod|admin role`, `/perms status`.

**Persistence:** guildConfig only. **Intents:** none new.

---

## Build process (per phase)

1. One `Workflow` per phase: parallel `implementer` agents (one per file/cohesive group) → per-file `reviewer`
   agent (adversarial: correctness, perms, ack-discipline, persistence races) → fix loop.
2. Wire new modules into `commandModules` / `modules` / intents in `index.js`.
3. `npm test` (`node --test`) must stay green; add unit tests for pure logic (duration parsing, automod
   detectors, invite diffing, access layering, poll tally).
4. Commit per phase, push to `master` → Railway auto-deploys. Report the phase result; await go-ahead implicitly
   per the approved A→G order (user gets an update after each phase).

## Status — COMPLETE (2026-06-22)

All 7 phases shipped to `master` and deployed (Railway). 110 unit tests passing; 42 slash commands.
- Phase A `e8b4e4b` · Phase B `aa04caa` · Phase C `2290bed` · Phase D `d212886`
- Phase E `cf1bff1` · Phase F `d7ed211` · Phase G `1d487f6`

Each new module is wired into `index.js` (modules) / `commandModules`, gated through the unified
`access.canRun` dispatcher, and persists to JSON on the Railway Volume.

## Out of scope (this spec)

Web dashboard, PostgreSQL/Prisma, Docker, multi-shard 100k-server scaling, welcome image-card rendering
(text welcome already exists; image card remains a separate future phase).
