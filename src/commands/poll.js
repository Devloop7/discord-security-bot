// src/commands/poll.js — /poll: post a public, button-voted poll (2-5 options).
// bypassModGate = true: this is a public command; the dispatcher skips the
// global isMod gate so anyone can create a poll.
//
// Polls are keyed by their MESSAGE id (see pollStore): we reply first, fetch the
// reply to learn the message id, then persist the poll under that id so button
// clicks ('poll:<optionIndex>') map back via interaction.message.id. When a
// duration is given, a durable 'poll-close' job (registered by utility/index.js)
// closes the poll at endsAt — surviving restarts via the scheduler.
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const logger = require('../core/logger');
const pollStore = require('../utility/pollStore');

const MAX_MINUTES = 10080; // 7 days

const data = new SlashCommandBuilder()
  .setName('poll')
  .setDescription('Create a poll with 2-5 options and button voting')
  .addStringOption((o) =>
    o.setName('question').setDescription('The poll question').setRequired(true),
  )
  .addStringOption((o) =>
    o.setName('option1').setDescription('Choice 1').setRequired(true),
  )
  .addStringOption((o) =>
    o.setName('option2').setDescription('Choice 2').setRequired(true),
  )
  .addStringOption((o) =>
    o.setName('option3').setDescription('Choice 3'),
  )
  .addStringOption((o) =>
    o.setName('option4').setDescription('Choice 4'),
  )
  .addStringOption((o) =>
    o.setName('option5').setDescription('Choice 5'),
  )
  .addIntegerOption((o) =>
    o
      .setName('minutes')
      .setDescription('Auto-close after this many minutes (1-10080 = up to 7 days)')
      .setMinValue(1)
      .setMaxValue(MAX_MINUTES),
  );

async function execute(interaction) {
  const question = interaction.options.getString('question');

  // Collect the present option strings in order, trimming and dropping any
  // that are empty/whitespace-only so we never render a blank choice.
  const options = ['option1', 'option2', 'option3', 'option4', 'option5']
    .map((name) => interaction.options.getString(name))
    .filter((value) => value != null && value.trim().length > 0)
    .map((value) => value.trim());

  if (options.length < 2 || options.length > 5) {
    return interaction.reply({
      content: '⛔ A poll needs between 2 and 5 non-empty options.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const minutes = interaction.options.getInteger('minutes');
  const endsAt = minutes ? Date.now() + minutes * 60000 : null;

  // Draft used only for the initial render; the persisted record is created
  // once we know the message id (createPoll seeds votes/closed itself).
  const draft = { question, options, votes: {}, endsAt, closed: false };

  try {
    await interaction.reply({
      embeds: [pollStore.renderEmbed(draft)],
      components: pollStore.renderRows(draft),
    });

    const msg = await interaction.fetchReply();

    await pollStore.createPoll(msg.id, {
      guildId: interaction.guild.id,
      channelId: interaction.channelId,
      question,
      options,
      endsAt,
    });

    if (endsAt) {
      require('../core/scheduler').schedule('poll-close', endsAt, {
        messageId: msg.id,
        channelId: interaction.channelId,
        guildId: interaction.guild.id,
      });
    }
  } catch (e) {
    logger.error('[poll]', e.message);
    if (!interaction.replied && !interaction.deferred) {
      await interaction
        .reply({ content: "⚠️ Couldn't create that poll.", flags: MessageFlags.Ephemeral })
        .catch(() => {});
    } else {
      await interaction
        .followUp({ content: "⚠️ Couldn't create that poll.", flags: MessageFlags.Ephemeral })
        .catch(() => {});
    }
  }
}

module.exports = { data, execute, bypassModGate: true };
