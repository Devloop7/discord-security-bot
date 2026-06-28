// src/protection/links.js
const { Events } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const { hasLink, domainsOf, isInvite, isScam } = require('./linkscan');
const { canPostLinks, isFilterExempt } = require('../core/whitelist');
const { nextTimeout } = require('../core/escalate');
const strikes = require('../core/strikes');
const modlog = require('../core/modlog');
const actioned = require('./actioned');
const config = require('../../config');
const logger = require('../core/logger');

const scamDomains = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'scam-domains.json'), 'utf8'));

async function banMember(member, reason) {
  if (member?.bannable) await member.ban({ reason }).catch(() => {});
}

function register(client) {
  client.on(Events.MessageCreate, async (msg) => {
    try {
      if (msg.author.bot || !msg.guild || !msg.content) return;
      if (isFilterExempt(msg.member)) return; // owner + admins are never filtered

      const domains = domainsOf(msg.content);
      const invite = config.link.blockInvites && isInvite(msg.content);
      if (!hasLink(msg.content) && !invite) return;

      // Allowed domains anyone may post, plus trusted roles/channels → ignore.
      const allDomainsAllowed = domains.length > 0 && domains.every((d) => config.link.allowedDomains.includes(d));
      if (!invite && allDomainsAllowed) return;
      if (canPostLinks(msg.member, msg.channel.id)) return;
      if (!actioned.claim(msg.id)) return;

      await msg.delete().catch(() => {});

      // Known scam / IP-grabber → genuinely dangerous → instant ban (configurable).
      if (isScam(domains, scamDomains)) {
        if (config.link.banScamLinks) {
          await banMember(msg.member, 'Posted a known scam/phishing link');
          await modlog.log(msg.guild, {
            title: '🚨 Scam link — instant ban',
            description: `**User:** ${msg.author.tag} (${msg.author.id})\n**Domains:** ${domains.join(', ')}`,
            color: 0xE74C3C, ping: true,
          });
          return;
        }
        // banScamLinks disabled → fall through to the normal escalating-mute path.
      }

      // Normal (non-dangerous) link → NEVER auto-ban.
      // 1st offense = warning only; repeats = escalating mute. Ban manually if it persists.
      const count = strikes.add(msg.author.id, 'link', (config.link.strikeDecayDays || 0) * 86400000);
      const content = invite ? 'Discord invite' : domains.join(', ');

      if (count <= 1) {
        await msg.channel.send({ content: `${msg.author}, links aren't allowed here. ⚠️ This is a friendly warning — please don't post links.` })
          .then((m) => setTimeout(() => m.delete().catch(() => {}), 8000))
          .catch(() => {});
        await modlog.log(msg.guild, {
          title: '🔗 Link removed (warning)',
          description: `**User:** ${msg.author.tag} (${msg.author.id})\n**Offense:** ${count} (warning only)\n**Content:** ${content}`,
        });
        return;
      }

      // Repeat offender → escalating mute (count 2 → first step, 3 → second, …).
      const ms = nextTimeout(count - 1, config.link.timeoutSteps);
      let action = 'warned again';
      if (ms > 0 && msg.member?.moderatable) {
        await msg.member.timeout(ms, 'Repeated link posting').catch(() => {});
        action = `muted (${config.link.timeoutSteps[Math.min(count - 1, config.link.timeoutSteps.length) - 1]})`;
      }
      await msg.channel.send({ content: `${msg.author}, links aren't allowed here. 🔇 You've been ${action} for repeating it.` })
        .then((m) => setTimeout(() => m.delete().catch(() => {}), 8000))
        .catch(() => {});
      await modlog.log(msg.guild, {
        title: '🔗 Link removed — repeat offender',
        description: `**User:** ${msg.author.tag} (${msg.author.id})\n**Offense:** ${count}\n**Action:** ${action}\n**Content:** ${content}`,
      });
    } catch (err) {
      logger.error('[links]', err.message);
    }
  });
}

module.exports = { register };
