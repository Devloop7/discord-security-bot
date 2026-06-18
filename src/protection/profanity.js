// src/protection/profanity.js
const { Events } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const { containsBadWord } = require('./normalize');
const { nextTimeout } = require('../core/escalate');
const strikes = require('../core/strikes');
const modlog = require('../core/modlog');
const config = require('../../config');

const words = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'badwords.json'), 'utf8'));

function register(client) {
  client.on(Events.MessageCreate, async (msg) => {
    try {
      if (msg.author.bot || !msg.guild || !msg.content) return;
      if (!containsBadWord(msg.content, words)) return;

      await msg.delete().catch(() => {});
      const count = strikes.add(msg.author.id, 'profanity');
      const ms = nextTimeout(count, config.profanity.timeoutSteps);

      let action = 'warned';
      if (ms > 0 && msg.member?.moderatable) {
        await msg.member.timeout(ms, 'Profanity filter').catch(() => {});
        action = `timed out (${config.profanity.timeoutSteps[Math.min(count, config.profanity.timeoutSteps.length) - 1]})`;
      }

      await msg.channel.send({ content: `${msg.author}, watch your language. You have been ${action}.` })
        .then((m) => setTimeout(() => m.delete().catch(() => {}), 6000))
        .catch(() => {});

      await modlog.log(msg.guild, {
        title: '🤬 Profanity removed',
        description: `**User:** ${msg.author.tag} (${msg.author.id})\n**Action:** ${action}\n**Offense #:** ${count}`,
      });
    } catch (err) {
      console.error('[profanity]', err.message);
    }
  });
}

module.exports = { register };
