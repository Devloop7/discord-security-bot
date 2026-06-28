# Vouch Review Panel — Design Spec

**Date:** 2026-06-28
**Approved:** shop/server reviews (not peer) · 1–5 stars + average · flow = button → star select → modal · proof link ·
**replaces** the peer `/vouch @user` shipped earlier. All embeds via `src/ui/theme.js`.

Evolves the vouch system into a **shop review** system driven by a posted panel (like the reference screenshot,
plus: star ratings, average, distribution, inline proof, color-by-rating, and a live-updating panel).

---

## Data & config

`reviews.json` (on the Volume): `{ "<guildId>": [ { from, rating, comment, proof|null, ts } ] }`.
One review per person per guild.

`guildConfig.vouch` (replace the old shape):
`{ channelId: null, panelChannelId: null, panelMessageId: null }`
- `channelId` — review **feed** channel (each submitted review is posted here).
- `panelChannelId` + `panelMessageId` — the posted panel, so it can be edited to refresh live stats.

## Components

### `src/vouch/store.js` (rewrite → reviews model; pure helpers unit-tested)
- `hasReviewed(guildId, fromId)` → bool · `count(guildId)` · `average(guildId)` → number (1 dp, 0 if none)
- `distribution(guildId)` → `{1..5: n}` · `recent(guildId, n)` → newest-first
- `addReview(guildId, fromId, { rating, comment, proof }, ts?)` → `{ ok, count, average }` or `{ error }`
  (rejects if already reviewed or rating ∉ 1..5; check is **inside** the serialized write)
- `removeReview(guildId, fromId)` → `{ removed, count }`
- pure: `avgOf(list)`, `distOf(list)` (exported for tests)

### `src/vouch/panel.js` (rendering + interaction router; namespace `vouch:`)
- `renderStars(rating)` → `⭐×rating` + `(rating/5)`
- `ratingColor(rating)` → success(5) / brand(4) / warning(3) / danger(≤2)
- `panelEmbed(scope, stats)` → premium panel: title "Share your experience", the rate/tell/proof bullets,
  guild icon thumbnail, live footer/desc `⭐ {avg} · {count} reviews`. Built with `theme.baseEmbed`.
- `panelComponents()` → row with button `vouch:leave` ("📝 Leave a Vouch")
- `starSelectComponents()` → row with `StringSelectMenu` `vouch:stars` (5 options, ⭐..⭐⭐⭐⭐⭐)
- `reviewEmbed(scope, reviewer, review)` → posted review: stars, comment, **proof rendered inline** if it's an
  image URL (else a "Proof" link field), `ratingColor`, reviewer author, branded footer + timestamp
- `updatePanel(guild)` → edit the stored panel message with refreshed stats (graceful if missing)
- `register(client)` — router:
  - button `vouch:leave` → if `hasReviewed` reply ephemeral "already reviewed", else reply ephemeral star select
  - select `vouch:stars` → `interaction.showModal('vouch:modal:<rating>')` with **What stood out?** (paragraph,
    required) + **Proof link (optional)** (short)
  - modal `vouch:modal:<rating>` → `addReview`, post `reviewEmbed` to the feed channel, `updatePanel`, reply
    ephemeral thanks
  - early-return on any non-`vouch:` customId

### `src/commands/vouch.js` (rewrite → `/vouch`)
Public. Opens the same review flow: if `hasReviewed` reply ephemeral, else reply ephemeral with the star select.

### `src/commands/vouches.js` (rewrite)
Public command; staff subcommands self-gate via `isStaff`.
- `panel [channel]` (staff) — post the panel + button; store `panelChannelId`/`panelMessageId`.
- `stats` — average ⭐, total, star-distribution bars.
- `recent` — last 5 reviews (stars + comment + reviewer + relative time).
- `setup channel` (staff) — set the review feed `channelId`.
- `remove user` (staff) — remove a member's review (anti-abuse); refresh the panel.

## Wiring, theming, verification
- Add `require('./src/vouch/panel')` to the `modules` array in `index.js` (interaction router).
- Keep `/vouch` + `/vouches` in `commandModules` (rewritten, not re-added).
- Every embed uses `src/ui/theme.js` (`baseEmbed`, `COLORS`, `EMOJI`, branded footer) — matches tickets/suggestions.
- Replace `test/vouchStore.test.js` with review tests (one-per-person, average, distribution, recent, remove).
- `node --test` green + bootstrap smoke. Commit → push to master → Railway auto-deploys; data on the Volume.

## Out of scope
Editing a submitted review, multi-image proof, verified-buyer role gating, per-product reviews.
