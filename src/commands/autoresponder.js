// src/commands/autoresponder.js — /autoresponder add | list | remove
// bypassModGate = true: the dispatcher skips the global isMod gate for this
// command; staff permission is enforced here via isStaff().
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const guildConfig = require('../core/guildConfig');
const { isStaff } = require('../core/perms');
const logger = require('../core/logger');

const MATCH_CHOICES = [
  { name: 'Contains', value: 'contains' },
  { name: 'Exact', value: 'exact' },
  { name: 'Starts with', value: 'starts' },
];

const data = new SlashCommandBuilder()
  .setName('autoresponder')
  .setDescription('Manage trigger → auto reply rules')
  // ── add ────────────────────────────────────────────────────────────────
  .addSubcommand((sub) =>
    sub
      .setName('add')
      .setDescription('Add an autoresponder')
      .addStringOption((o) =>
        o.setName('trigger').setDescription('Text that triggers the reply').setRequired(true),
      )
      .addStringOption((o) =>
        o.setName('response').setDescription('Reply to send').setRequired(true),
      )
      .addStringOption((o) =>
        o
          .setName('match')
          .setDescription('How the trigger is matched (default: Contains)')
          .addChoices(...MATCH_CHOICES),
      ),
  )
  // ── list ───────────────────────────────────────────────────────────────
  .addSubcommand((sub) =>
    sub.setName('list').setDescription('List all autoresponders'),
  )
  // ── remove ─────────────────────────────────────────────────────────────
  .addSubcommand((sub) =>
    sub
      .setName('remove')
      .setDescription('Remove an autoresponder by id')
      .addStringOption((o) =>
        o.setName('id').setDescription('Autoresponder id (see /autoresponder list)').setRequired(true),
      ),
  );

async function execute(interaction) {
  // Staff-only — self-checked because bypassModGate is set.
  if (!isStaff(interaction.member, interaction.guildId)) {
    return interaction.reply({ content: '⛔ Staff only.', flags: MessageFlags.Ephemeral });
  }

  const sub = interaction.options.getSubcommand();
  try {
    if (sub === 'add') return await handleAdd(interaction);
    if (sub === 'list') return await handleList(interaction);
    if (sub === 'remove') return await handleRemove(interaction);
  } catch (err) {
    logger.error('[autoresponder]', err.message);
    if (!interaction.replied && !interaction.deferred) {
      await interaction
        .reply({ content: '⚠️ Autoresponder command failed.', flags: MessageFlags.Ephemeral })
        .catch(() => {});
    }
  }
}

async function handleAdd(interaction) {
  const guildId = interaction.guildId;
  const trigger = interaction.options.getString('trigger');
  const response = interaction.options.getString('response');
  const match = interaction.options.getString('match') || 'contains';

  const existing = guildConfig.get(guildId).autoresponders || [];
  const newOne = { id: String(Date.now()), trigger, response, match };

  // NOTE: guildConfig.set deep-merges objects but REPLACES arrays, so we read
  // the existing array, append, and set the full array back.
  guildConfig.set(guildId, { autoresponders: [...existing, newOne] });

  return interaction.reply({
    content:
      `✅ Added autoresponder \`${newOne.id}\`\n` +
      `• Trigger: "${trigger}"\n` +
      `• Match: ${match}\n` +
      `• Response: ${trim(response, 200)}`,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleList(interaction) {
  const guildId = interaction.guildId;
  const list = guildConfig.get(guildId).autoresponders || [];

  if (list.length === 0) {
    return interaction.reply({
      content: 'No autoresponders configured. Add one with `/autoresponder add`.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const lines = list.map(
    (a) =>
      `\`${a.id}\` • [${a.match}] "${trim(a.trigger, 60)}" → ${trim(a.response, 80)}`,
  );

  return interaction.reply({
    content: `**Autoresponders (${list.length}):**\n${lines.join('\n')}`,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleRemove(interaction) {
  const guildId = interaction.guildId;
  const id = interaction.options.getString('id');

  const existing = guildConfig.get(guildId).autoresponders || [];
  const filtered = existing.filter((a) => a.id !== id);

  if (filtered.length === existing.length) {
    return interaction.reply({
      content: `⚠️ No autoresponder found with id \`${id}\`.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  guildConfig.set(guildId, { autoresponders: filtered });

  return interaction.reply({
    content: `✅ Removed autoresponder \`${id}\`.`,
    flags: MessageFlags.Ephemeral,
  });
}

function trim(str, max) {
  const s = String(str ?? '');
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

module.exports = { data, execute, bypassModGate: true };
