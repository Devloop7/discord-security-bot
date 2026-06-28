# Admin Filter-Exemption + Vouch System — Design Spec

**Date:** 2026-06-28
**Approved:** admins exempt from content filters (anti-nuke/raid stay owner-only) · simple +1 vouch with comment ·
no reward roles (count + leaderboard) · one vouch per person ever · vouch embeds use the existing `src/ui/theme.js`.

---

## Part 1 — Exempt the owner + admins from content filters

**Problem (verified):** `profanity.js` has no exemption at all; `links.js` only exempts allowed roles/channels —
so the owner gets profanity/link warnings. `spam.js`/`automod.js` already exempt the owner via `isTrusted`.

**Change:** add one helper to `src/core/whitelist.js`:

```js
const { PermissionFlagsBits } = require('discord.js');
// Content-filter exemption: owner + OWNER_IDS + trustedUsers (via isTrusted), plus anyone with
// Manage Server (Administrator implies it). Used ONLY by content filters — NOT by anti-nuke/raid.
function isFilterExempt(member) {
  if (!member) return false;
  if (isTrusted(member)) return true;
  return member.permissions?.has?.(PermissionFlagsBits.ManageGuild) || false;
}
```

Wire it as an early `return` into the four content filters:
- `profanity.js` — add the check (currently none).
- `links.js` — `if (isFilterExempt(msg.member) || canPostLinks(msg.member, msg.channel.id)) return;`
- `spam.js` — replace `isTrusted(msg.member)` with `isFilterExempt(msg.member)`.
- `automod.js` — replace `isTrusted(msg.member)` with `isFilterExempt(msg.member)`.

**Explicitly NOT changed (security boundary):** `antinuke.js`, `antiraid.js`, `webhooks.js`, `antibot.js` keep using
`isTrusted` (owner-only). A compromised admin is the threat these defend against, so admins must stay untrusted there.

**Test:** extend `test/whitelist.test.js` — `isFilterExempt` true for owner / ManageGuild member, false for a plain member.

---

## Part 2 — Vouch System

A reputation system: members vouch for each other; counts + a leaderboard; each vouch optionally posted to a
configured channel as a branded embed. **No reward roles.**

### Data & config
- `vouches.json` (on the Volume): `{ "<guildId>": { "<targetId>": [ { from, comment, ts } ] } }`.
- `guildConfig.vouch = { channelId: null }` (the vouch-feed channel), added to DEFAULTS.

### `src/vouch/store.js` (hub + pure-ish helpers, unit-tested)
- `addVouch(guildId, fromId, targetId, comment)` → `{ ok, count }` or `{ error }` (rejects if `hasVouched`).
- `hasVouched(guildId, fromId, targetId)` → bool (enforces one-per-person).
- `removeVouch(guildId, fromId, targetId)` → `{ removed, count }` (staff un-fake).
- `countFor(guildId, targetId)` → number · `recentFor(guildId, targetId, n)` → last n `{from,comment,ts}`.
- `leaderboard(guildId, n)` → `[{ targetId, count }]` desc.

### Commands
- **`/vouch user [comment]`** (public; `bypassModGate: true`). Guards: not self, not a bot, not already vouched
  (`hasVouched`). Light rate-limit via `RateWindow` (e.g. 5/min per giver). On success: `addVouch`, reply ephemeral
  confirmation, and if `guildConfig.vouch.channelId` is set, post a branded embed there (giver → target, comment,
  new total). Uses `theme.baseEmbed` + `COLORS`/`EMOJI`.
- **`/vouches`** with subcommands:
  - `view [user]` (public) — target's count + recent vouches (with comments), themed embed.
  - `leaderboard` (public) — top 10 by count, themed embed.
  - `setup channel` (self-gated `isStaff`) — set `guildConfig.vouch.channelId`.
  - `remove from user` (self-gated `isStaff`) — remove a specific vouch (fake/abuse).

### Theming (user's explicit requirement)
Every vouch embed is built with `src/ui/theme.js`: `baseEmbed(interaction, { color })`, `COLORS.success`/`accent`,
`EMOJI.success`/`star`/`up`, `line()`/`field()`, and the branded footer — identical visual language to tickets,
suggestions, and the post formatter.

### Wiring & verification
Add `/vouch` + `/vouches` to `commandModules` in `src/commands/index.js`. `node --test` stays green; add
`test/vouchStore.test.js` (one-per-person, count, leaderboard, remove). Bootstrap smoke. Commit → push to master →
Railway auto-deploys; data persists on the Volume.

## Out of scope
Reward roles / vouch levels, star ratings, vouch editing, cross-server vouches.
