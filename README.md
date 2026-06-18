# Discord Security Bot

High-protection moderation bot: anti-link, anti-profanity, anti-spam, anti-nuke, anti-raid.

## Setup
1. **Create the app/bot** at https://discord.com/developers/applications (App ID `1517206448424091738`).
2. In **Bot** → **Reset Token** → copy it. Create a `.env` file (copy `.env.example`) and paste it as `BOT_TOKEN`. NEVER share this token.
3. In **Bot**, enable **MESSAGE CONTENT INTENT** and **SERVER MEMBERS INTENT**.
4. Install: `npm install`
5. Edit `config.js` — fill in `guildId`, `modLogChannelId`, `trustedUsers` (your user ID), and any allowed link roles/channels.
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
