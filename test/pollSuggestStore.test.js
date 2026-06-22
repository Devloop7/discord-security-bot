// test/pollSuggestStore.test.js — pure-logic tests for poll/suggestion stores.
// Uses an isolated temp data dir so it never touches real data.
const { test } = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

process.env.BOT_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'botdata-'));

const poll = require('../src/utility/pollStore');
const suggest = require('../src/utility/suggestStore');

test('poll: tally + totalVotes count votes per option', () => {
  const p = { options: ['a', 'b', 'c'], votes: { u1: 0, u2: 0, u3: 2 } };
  assert.deepStrictEqual(poll.tally(p), [2, 0, 1]);
  assert.strictEqual(poll.totalVotes(p), 3);
});

test('poll: vote toggles and switches, ignores closed/out-of-range', async () => {
  await poll.createPoll('m1', { guildId: 'g', channelId: 'c', question: 'q', options: ['a', 'b'] });
  await poll.vote('m1', 'u1', 0);
  assert.strictEqual(poll.getPoll('m1').votes.u1, 0);
  await poll.vote('m1', 'u1', 1); // switch
  assert.strictEqual(poll.getPoll('m1').votes.u1, 1);
  await poll.vote('m1', 'u1', 1); // toggle off
  assert.strictEqual(poll.getPoll('m1').votes.u1, undefined);
  await poll.vote('m1', 'u1', 9); // out of range — no change
  assert.strictEqual(poll.getPoll('m1').votes.u1, undefined);
  await poll.closePoll('m1');
  const after = await poll.vote('m1', 'u2', 0); // closed — rejected
  assert.strictEqual(after, null);
  assert.strictEqual(poll.getPoll('m1').votes.u2, undefined);
});

test('suggest: toggleVote enforces one side per user + score', async () => {
  await suggest.addSuggestion('s1', { guildId: 'g', channelId: 'c', authorId: 'a', text: 'hi' });
  await suggest.toggleVote('s1', 'u1', 'up');
  await suggest.toggleVote('s1', 'u2', 'down');
  let s = suggest.getSuggestion('s1');
  assert.deepStrictEqual([s.up, s.down], [['u1'], ['u2']]);
  assert.strictEqual(suggest.score(s), 0);
  await suggest.toggleVote('s1', 'u2', 'up'); // u2 switches down->up
  s = suggest.getSuggestion('s1');
  assert.deepStrictEqual([s.up.sort(), s.down], [['u1', 'u2'], []]);
  assert.strictEqual(suggest.score(s), 2);
  await suggest.toggleVote('s1', 'u1', 'up'); // u1 toggles off
  assert.strictEqual(suggest.score(suggest.getSuggestion('s1')), 1);
});
