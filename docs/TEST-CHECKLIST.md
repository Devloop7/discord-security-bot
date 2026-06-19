# Live Test Checklist (use a throwaway test server)

Prereq: bot online, config filled, role near top, commands registered.

- [ ] Post a bad word as a normal member → message deleted, you get timed out, mod-log entry.
- [ ] Post a link as a normal member → deleted, 1st = friendly warning, repeats = escalating mute (NOT banned). Scam-list domain → instant ban.
- [ ] Post a link as a trusted-role member → allowed.
- [ ] Post `discord.gg/...` invite → treated as a link offense.
- [ ] Send 6 messages in 3s → muted (flood).
- [ ] Send a message mentioning 5+ users / @everyone → deleted + muted.
- [ ] With a second alt account, rapidly delete 3 channels → alt stripped + banned, alert pinged.
- [ ] Grant Administrator to a test role via a non-trusted account → reverted + alert.
- [ ] Add a bot with a non-trusted account → bot kicked.
- [ ] Simulate 10 joins in 30s (or lower thresholds temporarily) → lockdown + verification raised.
- [ ] Run `/lockdown` → all channels locked; `/unlock` → restored.
- [ ] Run `/strikes @user`, `/warn`, `/mute`, `/kick`, `/ban` → each works + logs.
- [ ] Run `/warn @user reason`, then `/warnings @user` → shows the case; `/note @user text` adds a private note; `/clearwarnings @user` wipes them.

## Ticket system
- [ ] Run `/ticket setup` (panel channel, message, staff role, log + transcript channels) → panel posts with a **Create Ticket** button.
- [ ] Click **Create Ticket** as a normal member → reason modal → a private `ticket-001` channel appears, visible only to you + staff, with a pinned welcome embed + control buttons. "open" logged.
- [ ] Spam the button → rate-limited after 3 tries; open up to the max, then blocked with the limit message.
- [ ] As staff: **Claim** (button disables, embed updates) → **Unclaim**. **Pin** (📌 prefix + moves to top) → unpin. Set **priority** (embed color/line change + log).
- [ ] As the opener: `/ticket close` works; as a non-staff non-opener: close is denied.
- [ ] **Close** (button → reason modal) → channel moves to closed category, your access revoked, Reopen/Delete buttons appear, you get a DM + ⭐ feedback survey.
- [ ] In the DM: tap a star, add a comment, or decline → feedback logged to the log channel.
- [ ] **Reopen** → access restored, status back to Open. **Delete** → after 3s an HTML transcript posts to the transcript channel, then the channel is deleted.
