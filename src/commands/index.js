// src/commands/index.js
const { Events, Collection, MessageFlags } = require('discord.js');
const logger = require('../core/logger');
const access = require('../core/access');

const commandModules = [
  require('./lockdown'),
  require('./unlock'),
  require('./strikes'),
  require('./ban'),
  require('./kick'),
  require('./mute'),
  require('./warn'),
  require('./note'),
  require('./warnings'),
  require('./clearwarnings'),
  require('./clearstrikes'),
  require('./ticket'),
  require('./embed'),
  require('./say'),
  require('./embededit'),
  require('./embedbuilder'),
  require('./autopost'),
  require('./autoresponder'),
  require('./welcome'),
  // Phase A — moderation completion
  require('./tempban'),
  require('./unban'),
  require('./softban'),
  require('./tempmute'),
  require('./purge'),
  require('./slowmode'),
  require('./role'),
  require('./nick'),
  // Phase B — utility & info
  require('./userinfo'),
  require('./serverinfo'),
  require('./roleinfo'),
  require('./channelinfo'),
  require('./avatar'),
  require('./banner'),
  require('./membercount'),
  require('./poll'),
  require('./suggest'),
  require('./suggestions'),
  // Phase C — reaction roles
  require('./reactionroles'),
  require('./logging'),
  // Phase E — automod config
  require('./automod'),
  // Phase F — invite tracker
  require('./invites'),
  // Phase G — permission / staff-levels
  require('./perms'),
];

const commands = new Collection();
for (const c of commandModules) commands.set(c.data.name, c);

function register(client) {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const cmd = commands.get(interaction.commandName);
    if (!cmd) return;
    try {
      // Unified authorization (owner / overrides / staff levels / ManageGuild).
      // bypassModGate commands are public by default but still honour disable/deny overrides.
      const verdict = access.canRun(interaction.member, interaction.commandName, interaction.guildId, { bypassModGate: cmd.bypassModGate });
      if (!verdict.ok) {
        return interaction.reply({ content: `⛔ ${verdict.reason}`, flags: MessageFlags.Ephemeral });
      }
      await cmd.execute(interaction);
    } catch (err) {
      logger.error('[command]', err.message);
      if (!interaction.replied && !interaction.deferred) interaction.reply({ content: '⚠️ Command failed.', flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  });
}

module.exports = { register, commandModules };
