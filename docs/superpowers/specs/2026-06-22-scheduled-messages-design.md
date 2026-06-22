# Scheduled Messages (Auto-Posts v2) — Design Spec

**Date:** 2026-06-22
**Goal:** Design any kind of message, choose exactly when, and have the bot post it automatically — all
schedule types, edit/pause/test, role ping, pin. Extends the existing `/autopost` (kept 100% backward-compatible).

**Approved decisions:** all schedule types · per-guild timezone (default `Asia/Jerusalem`) · quick + full-builder
design · edit/pause/resume/test/ping/pin · use the `croner` library for schedule math.

## Library — croner 10.0.1 (MIT, zero-dependency)

Verified empirically: `new Cron(pattern, { timezone }).nextRun(fromDate?)` returns a timezone- and DST-aware
`Date` (or `null`). Used ONLY for calendar-aligned types (daily/weekly/monthly). One-time and interval use plain
arithmetic. The existing durable `scheduler` remains the firing engine (jobs persisted, re-armed on boot).

## Reliability fix — scheduler sweep

`scheduler.arm()` skips `setTimeout` delays > ~24.8 days (Node max), relying on `init()` at next boot. A monthly
post could be missed if the bot runs >24 days without a reboot. Fix: add a periodic **sweep** (every 6h, unref'd)
that runs overdue jobs and arms any job that has come within the `setTimeout` window. Targeted improvement to
`src/core/scheduler.js`; existing behaviour unchanged.

## Data model

`autoposts.json` (extended; keyed by `id`). **New** scheduled-post def:

```
{ id, guildId, channelId,
  payload: { kind:'text'|'embed', content, title, embed, mentionRoleId, pin },
  schedule: { type:'once'|'daily'|'weekly'|'monthly'|'interval', tz,
              at, time:'HH:MM', days:[0-6], dom:1-31, everyMinutes },
  enabled: true, nextAt, jobId, createdBy, createdAt }
```

**Backward compatibility:** legacy defs (top-level `title`/`message`/`every`, no `payload`/`schedule`) keep firing
via the existing INTERVALS path. The handler branches on `def.schedule` presence.

`autopost-designs.json` (new): saved embed designs per guild — `{ <guildId>: { <name>: embedJson } }`.

`guildConfig` gains `autopost: { timezone: 'Asia/Jerusalem' }`.

## Components

- **`src/autopost/schedule.js`** (new, pure + unit-tested): `cronFor(schedule)→pattern|null`,
  `nextRunAt(schedule, fromMs)→ms|null` (croner for cron types; arithmetic for once/interval),
  `parseTime('HH:MM')`, `isValidTz(tz)`, `validateSchedule(input)→{ok,schedule}|{error}`. Day mapping: cron dow
  `0=Sun..6=Sat` matches JS `getDay()`. once: `at` if future else null (expired). interval: `fromMs + everyMinutes*60000`.
- **`src/autopost/designs.js`** (new): `save(guildId,name,embed)`, `get`, `list`, `remove` on `autopost-designs.json`.
- **`src/autopost/index.js`** (extend handler): new-def branch renders `payload` (text or embed, from inline
  fields or a saved design), prepends `<@&mentionRoleId>` if set, sends, pins if `pin`, then reschedules via
  `nextRunAt` (or deletes on `once`/expired). `enabled:false` skips sending but keeps rescheduling so resume works.
  Legacy branch unchanged.
- **`src/commands/autopost.js`** (rewrite): subcommands
  `create` (channel, type, time/date/days/dom/every, message|design, title?, mention_role?, pin?),
  `design` (opens the embed builder), `list`, `edit` (change schedule/channel/enabled),
  `pause`/`resume`, `test` (send now, ignores schedule), `remove`, `timezone` (set guild tz, validated).
  Staff-gated (existing `isStaff` pattern). Schedule inputs validated via `schedule.validateSchedule`.
- **`src/embeds/interactions.js`** (extend): add a **"💾 Save as design"** button to the builder panel; its
  handler opens a 1-field modal (design name) and stores the current draft embed via `designs.save`. Minimal,
  namespace-safe addition; existing `eb:` handlers untouched.

## Standards

No placeholders/TODOs. Every command: error handling, staff permission check, single ack (`MessageFlags.Ephemeral`),
persistence via `store`/`guildConfig`, audit-friendly. Channel send-perm preflight (`checkSendPerms`). Listener/handler
bodies wrapped so one failure never crashes the bot. Unit tests for all `schedule.js` next-run math incl. a DST-period
case. Adversarial review of the handler + command. `croner` ships via `package.json` (Railway installs on deploy).

## Out of scope

Cron-expression free-text input (we expose typed options instead), multi-message threads, attachment uploads.
