# Discord Security Bot

High-protection moderation bot: anti-link, anti-profanity, anti-spam, anti-nuke, anti-raid.

## Setup
1. **Create the app/bot** at https://discord.com/developers/applications (App ID `1517206448424091738`).
2. In **Bot** → **Reset Token** → copy it. Create a `.env` file (copy `.env.example`) and paste it as `DISCORD_TOKEN`. NEVER share this token.
3. In **Bot**, enable **MESSAGE CONTENT INTENT** and **SERVER MEMBERS INTENT**.
4. Install: `npm install`
5. Edit `config.js` and/or `.env` — set `GUILD_ID` in `.env` (takes precedence) or fill in `guildId` in `config.js`. Also fill in `modLogChannelId`, `trustedUsers` (your user ID), and any allowed link roles/channels.
6. Invite the bot (replace IDs):
   `https://discord.com/oauth2/authorize?client_id=1517206448424091738&scope=bot+applications.commands&permissions=1100316945558`
   Permissions cover: Manage Roles/Channels/Messages/Webhooks, Kick, Ban, Timeout, View Audit Log.
7. **Drag the bot's role near the TOP** of Server Settings → Roles (it can only act on roles below its own).
8. Register slash commands: `npm run register`
9. Start: `npm start`

## How to get IDs
Enable Developer Mode (User Settings → Advanced), then right-click a server/channel/user → **Copy ID**.

## Tuning
Everything (thresholds, word list, whitelists) is in `config.js`, `src/data/badwords.json`, and `src/data/scam-domains.json`.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DISCORD_TOKEN` | Yes | Secret bot token from the Discord developer portal. Never commit this. |
| `CLIENT_ID` | Yes | Application (client) ID from the Discord developer portal. |
| `GUILD_ID` | Yes | Your server ID. Set here to avoid editing `config.js`. Takes precedence over `guildId` in `config.js`. |
| `MULTI_GUILD` | No | `true` = register slash commands globally (every server the bot is in; takes ~1 h to propagate). `false` (default) = register only in `GUILD_ID`, which is instant and recommended for a single server. |
| `OWNER_IDS` | No | Comma-separated user IDs merged into the anti-nuke trust list alongside `trustedUsers` in `config.js`. Useful for keeping sensitive IDs out of source control. |
| `LOG_LEVEL` | No | Controls console verbosity: `error`, `warn`, `info`, or `debug`. Defaults to `info`. Use `warn` for a quieter console in production. |
| `NODE_ENV` | No | Set to `production` for a quieter console (warnings/errors only) unless `LOG_LEVEL` is set. |
| `LOG_TO_FILE` | No | `true` writes all logs to `logs/bot.log` (useful when hosted 24/7). Default off. |

This bot also still accepts the older names `BOT_TOKEN` and `APP_ID`. All other variables seen in `.env.example` (PostgreSQL, web server, Sentry, backups) are inert placeholders included only to mirror TitanBot — they have no effect.
