// test/autopostSchedule.test.js — schedule validation + next-run math (croner-backed).
const { test } = require('node:test');
const assert = require('node:assert');
const { parseTime, isValidTz, cronFor, nextRunAt, validateSchedule, onceEpochFromDate } = require('../src/autopost/schedule');

const TZ = 'Asia/Jerusalem';
const localHM = (ms) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms));

test('parseTime accepts HH:MM, rejects junk', () => {
  assert.deepStrictEqual(parseTime('09:00'), { h: 9, m: 0 });
  assert.deepStrictEqual(parseTime('23:59'), { h: 23, m: 59 });
  assert.strictEqual(parseTime('24:00'), null);
  assert.strictEqual(parseTime('9'), null);
  assert.strictEqual(parseTime('nope'), null);
});

test('isValidTz', () => {
  assert.strictEqual(isValidTz('Asia/Jerusalem'), true);
  assert.strictEqual(isValidTz('UTC'), true);
  assert.strictEqual(isValidTz('Not/AZone'), false);
  assert.strictEqual(isValidTz(''), false);
});

test('cronFor builds correct patterns', () => {
  assert.strictEqual(cronFor({ type: 'daily', time: '09:00' }), '0 9 * * *');
  assert.strictEqual(cronFor({ type: 'weekly', time: '20:30', days: [3, 1, 1] }), '30 20 * * 1,3');
  assert.strictEqual(cronFor({ type: 'monthly', time: '08:05', dom: 1 }), '5 8 1 * *');
  assert.strictEqual(cronFor({ type: 'weekly', time: '20:00', days: [] }), null);
  assert.strictEqual(cronFor({ type: 'once' }), null);
});

test('nextRunAt: once returns the timestamp only if future', () => {
  const now = 1_000_000;
  assert.strictEqual(nextRunAt({ type: 'once', at: 2_000_000 }, now), 2_000_000);
  assert.strictEqual(nextRunAt({ type: 'once', at: 500_000 }, now), null); // past
});

test('nextRunAt: interval adds the minutes', () => {
  assert.strictEqual(nextRunAt({ type: 'interval', everyMinutes: 90 }, 1_000_000), 1_000_000 + 90 * 60000);
  assert.strictEqual(nextRunAt({ type: 'interval', everyMinutes: 0 }, 1_000_000), null);
});

test('nextRunAt: daily lands on the next 09:00 local and is in the future', () => {
  const from = Date.UTC(2026, 5, 22, 5, 0, 0); // 22 Jun 2026 05:00 UTC = 08:00 in Israel (summer)
  const next = nextRunAt({ type: 'daily', time: '09:00', tz: TZ }, from);
  assert.ok(next > from);
  assert.strictEqual(localHM(next), '09:00');
});

test('nextRunAt: weekly resolves to one of the requested days at the time', () => {
  const from = Date.UTC(2026, 5, 22, 0, 0, 0);
  const next = nextRunAt({ type: 'weekly', time: '20:00', days: [1, 3], tz: TZ }, from); // Mon/Wed
  assert.ok(next > from);
  assert.strictEqual(localHM(next), '20:00');
  const dow = new Date(next).getDay(); // not necessarily 1/3 in UTC, so check local day instead
  const localDow = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(new Date(next));
  assert.ok(['Mon', 'Wed'].includes(localDow), `expected Mon/Wed, got ${localDow}`);
});

test('DST stability: 09:00 local holds in both winter and summer', () => {
  const winter = nextRunAt({ type: 'daily', time: '09:00', tz: TZ }, Date.UTC(2026, 0, 10, 0, 0, 0)); // Jan
  const summer = nextRunAt({ type: 'daily', time: '09:00', tz: TZ }, Date.UTC(2026, 6, 10, 0, 0, 0)); // Jul
  assert.strictEqual(localHM(winter), '09:00');
  assert.strictEqual(localHM(summer), '09:00');
});

test('onceEpochFromDate resolves to the right local wall-clock time', () => {
  const epoch = onceEpochFromDate({ month: 12, day: 25, hour: 18, minute: 30 }, TZ);
  assert.ok(typeof epoch === 'number' && epoch > Date.now());
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(epoch));
  assert.ok(f.includes('25/12'), `expected 25/12, got ${f}`);
  assert.ok(f.includes('18:30'), `expected 18:30, got ${f}`);
  assert.strictEqual(onceEpochFromDate({ month: 13, day: 1, hour: 0, minute: 0 }, TZ), null); // bad month
});

test('validateSchedule normalizes and rejects bad input', () => {
  assert.strictEqual(validateSchedule({ type: 'daily', time: '9:05', tz: TZ }).schedule.time, '09:05');
  assert.ok(validateSchedule({ type: 'weekly', time: '20:00', days: [], tz: TZ }).error);
  assert.ok(validateSchedule({ type: 'monthly', time: '08:00', dom: 40, tz: TZ }).error);
  assert.ok(validateSchedule({ type: 'once', at: 1, tz: TZ }, 1000).error); // past
  assert.ok(validateSchedule({ type: 'interval', everyMinutes: 0 }).error);
  // invalid tz falls back to UTC, not an error
  assert.strictEqual(validateSchedule({ type: 'daily', time: '09:00', tz: 'Bad/Zone' }).schedule.tz, 'UTC');
});
