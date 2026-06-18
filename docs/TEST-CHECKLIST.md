# Live Test Checklist (use a throwaway test server)

Prereq: bot online, config filled, role near top, commands registered.

- [ ] Post a bad word as a normal member → message deleted, you get timed out, mod-log entry.
- [ ] Post a link as a normal member → deleted, strike 1 warning. Post again → banned.
- [ ] Post a link as a trusted-role member → allowed.
- [ ] Post `discord.gg/...` invite → treated as a link strike.
- [ ] Send 6 messages in 3s → muted (flood).
- [ ] Send a message mentioning 5+ users / @everyone → deleted + muted.
- [ ] With a second alt account, rapidly delete 3 channels → alt stripped + banned, alert pinged.
- [ ] Grant Administrator to a test role via a non-trusted account → reverted + alert.
- [ ] Add a bot with a non-trusted account → bot kicked.
- [ ] Simulate 10 joins in 30s (or lower thresholds temporarily) → lockdown + verification raised.
- [ ] Run `/lockdown` → all channels locked; `/unlock` → restored.
- [ ] Run `/strikes @user`, `/warn`, `/mute`, `/kick`, `/ban` → each works + logs.
