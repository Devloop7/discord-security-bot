// src/reactionroles/index.js — interaction router that applies self-roles.
//
// Listens for button/select interactions on self-role menus and toggles the
// member's roles via the pure resolvers in ./store. State lives entirely in
// guildConfig (keyed by message id), so this survives restarts.
//
// customIds owned here:
//   button -> 'rr:<roleId>'   select -> 'rr:select'
// Anything outside the 'rr:' namespace is ignored so other routers still run.
'use strict';

const { Events, MessageFlags } = require('discord.js');
const store = require('./store');
const logger = require('../core/logger');

function register(client) {
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (!interaction.guild) return;

      const isSelect =
        interaction.isStringSelectMenu &&
        interaction.isStringSelectMenu() &&
        interaction.customId === 'rr:select';
      const isBtn =
        interaction.isButton &&
        interaction.isButton() &&
        interaction.customId.startsWith('rr:') &&
        interaction.customId !== 'rr:select';

      // Namespace early-return: ignore foreign customIds so other routers work.
      if (!isSelect && !isBtn) return;

      const group = store.getGroup(interaction.guild.id, interaction.message.id);
      if (!group) {
        return interaction.reply({
          content: 'This self-role menu is no longer active.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const member = interaction.member;
      const me = interaction.guild.members.me;

      // Can the bot actually manage this role? (not managed, below our top role)
      const canManage = (roleId) => {
        const role = interaction.guild.roles.cache.get(roleId);
        return role && !role.managed && role.position < me.roles.highest.position;
      };

      let add = [];
      let remove = [];

      if (isBtn) {
        const roleId = interaction.customId.slice('rr:'.length);
        if (!canManage(roleId)) {
          return interaction.reply({
            content: "I can't assign that role (check my role position).",
            flags: MessageFlags.Ephemeral,
          });
        }
        const r = store.resolveButton(group, roleId, member.roles.cache.has(roleId));
        add = r.add;
        remove = r.remove;
      } else {
        const r = store.resolveSelect(
          group,
          interaction.values,
          [...member.roles.cache.keys()],
        );
        add = r.add.filter(canManage);
        remove = r.remove.filter(canManage);
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      if (add.length) await member.roles.add(add, 'Self-role');
      if (remove.length) await member.roles.remove(remove, 'Self-role');

      const names = (ids) => ids.map((id) => `<@&${id}>`).join(', ');
      let msg = 'No changes.';
      if (add.length && remove.length) {
        msg = `Updated your roles: +${names(add)} / -${names(remove)}`;
      } else if (add.length) {
        msg = `Added ${names(add)}.`;
      } else if (remove.length) {
        msg = `Removed ${names(remove)}.`;
      }

      await interaction.editReply({ content: msg });
    } catch (e) {
      logger.error('[reactionroles]', e.message);
      if (interaction.deferred && !interaction.replied) {
        interaction
          .editReply({ content: "⚠️ Couldn't update your roles." })
          .catch(() => {});
      } else if (!interaction.replied) {
        interaction
          .reply({
            content: "⚠️ Couldn't update your roles.",
            flags: MessageFlags.Ephemeral,
          })
          .catch(() => {});
      }
    }
  });
}

module.exports = { register };
