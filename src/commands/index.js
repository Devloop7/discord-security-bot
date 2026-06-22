// src/commands/index.js
const { Events, Collection, PermissionFlagsBits, MessageFlags } = require('discord.js');
const config = require('../../config');
const logger = require('../core/logger');

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
];

const commands = new Collection();
for (const c of commandModules) commands.set(c.data.name, c);

function isMod(member) {
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  return config.mods.roleId && member.roles.cache.has(config.mods.roleId);
}

function register(client) {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const cmd = commands.get(interaction.commandName);
    if (!cmd) return;
    try {
      if (!cmd.bypassModGate && !isMod(interaction.member)) {
        return interaction.reply({ content: '⛔ You are not allowed to use this.', flags: MessageFlags.Ephemeral });
      }
      await cmd.execute(interaction);
    } catch (err) {
      logger.error('[command]', err.message);
      if (!interaction.replied && !interaction.deferred) interaction.reply({ content: '⚠️ Command failed.', flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  });
}

module.exports = { register, commandModules };
