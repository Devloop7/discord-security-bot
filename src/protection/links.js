// src/protection/links.js
const { Events } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const { hasLink, domainsOf, isInvite, isScam } = require('./linkscan');
const { canPostLinks } = require('../core/whitelist');
const strikes = require('../core/strikes');
const modlog = require('../core/modlog');
const config = require('../../config');

const scamDomains = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'scam-domains.json'), 'utf8'));

async function banMember(member, reason) {
  if (member?.bannable) await member.ban({ reason }).catch(() => {});
}

function register(client) {
  client.on(Events.MessageCreate, async (msg) => {
    try {
      if (msg.author.bot || !msg.guild || !msg.content) return;

      const domains = domainsOf(msg.content);
      const invite = config.link.blockInvites && isInvite(msg.content);
      if (!hasLink(msg.content) && !invite) return;

      // Allowed domains anyone may post, plus trusted roles/channels → ignore.
      const allDomainsAllowed = domains.length > 0 && domains.every((d) => config.link.allowedDomains.includes(d));
      if (!invite && allDomainsAllowed) return;
      if (canPostLinks(msg.member, msg.channel.id)) return;

      await msg.delete().catch(() => {});

      // Known scam / IP-grabber → instant ban.
      if (isScam(domains, scamDomains)) {
        await banMember(msg.member, 'Posted a known scam/phishing link');
        await modlog.log(msg.guild, {
          title: '🚨 Scam link — instant ban',
          description: `**User:** ${msg.author.tag} (${msg.author.id})\n**Domains:** ${domains.join(', ')}`,
          color: 0xE74C3C, ping: true,
        });
        return;
      }

      // Otherwise: strike. Ban on reaching the configured threshold.
      const count = strikes.add(msg.author.id, 'link');
      if (count >= config.link.strikesToBan) {
        await banMember(msg.member, `Reached ${count} link strikes`);
        await modlog.log(msg.guild, {
          title: '⛔ Banned — link strikes',
          description: `**User:** ${msg.author.tag} (${msg.author.id})\n**Strikes:** ${count}`,
          color: 0xE74C3C, ping: true,
        });
        return;
      }

      await msg.channel.send({ content: `${msg.author}, links aren't allowed here. ⚠️ Strike ${count}/${config.link.strikesToBan} — next one is a ban.` })
        .then((m) => setTimeout(() => m.delete().catch(() => {}), 8000))
        .catch(() => {});

      await modlog.log(msg.guild, {
        title: '🔗 Link removed',
        description: `**User:** ${msg.author.tag} (${msg.author.id})\n**Strike:** ${count}/${config.link.strikesToBan}\n**Content:** ${invite ? 'Discord invite' : domains.join(', ')}`,
      });
    } catch (err) {
      console.error('[links]', err.message);
    }
  });
}

module.exports = { register };
