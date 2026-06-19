// config.js — every threshold, list, and ID lives here. Edit this file to tune the bot.
module.exports = {
  // Your server ID. You can also set GUILD_ID in .env (which takes precedence).
  guildId: "",
  modLogChannelId: "",    // channel where the bot reports every action
  alertRoleId: "",        // role pinged on nuke/raid/critical events (optional)
  // ANTI-NUKE allowlist. You can also set OWNER_IDS in .env (comma-separated) — both are merged.
  trustedUsers: [],       // ANTI-NUKE allowlist: explicit user IDs (you + co-owner) ONLY

  link: {
    allowedRoles: [],     // role IDs allowed to post links freely
    allowedChannels: [],  // channel IDs where links are always allowed
    allowedDomains: ["tenor.com", "giphy.com"], // domains anyone may post
    // Normal links are NEVER auto-banned. 1st offense = warning, repeats = escalating mute.
    // Ban persistent offenders yourself with /ban — you stay in control.
    timeoutSteps: ["10m", "1h", "12h", "1d"], // mute lengths for repeat link offenders
    banScamLinks: true,   // known scam/phishing/IP-grabber links = INSTANT BAN (genuinely dangerous)
    blockInvites: true,   // treat discord.gg invites as a link offense
  },

  profanity: {
    timeoutSteps: ["5m", "1h", "1d"], // escalating mute lengths per offense
  },

  spam: {
    maxMessages: 5,       // messages...
    perSeconds: 3,        // ...within this many seconds = flood
    maxMentions: 5,       // user/role mentions in one message = mass-mention
    muteMinutes: 10,      // timeout length for spam
  },

  antinuke: {
    maxActions: 3,        // destructive actions...
    perSeconds: 10,       // ...within this window by one user = nuke
    punishment: "ban",    // "ban" or "strip" (strip = remove roles only)
  },

  antiraid: {
    maxJoins: 10,         // joins...
    perSeconds: 30,       // ...within this window = raid
    minAccountAgeDays: 7, // during a raid, accounts younger than this are quarantined
    lockMinutes: 10,      // how long raid lockdown lasts before auto-lift
  },

  mods: {
    roleId: "",           // role allowed to use slash commands (besides admins)
  },
};
