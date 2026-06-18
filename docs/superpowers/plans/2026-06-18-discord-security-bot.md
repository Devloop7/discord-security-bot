# Discord Security Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a maximally reliable Discord security bot that blocks malicious links, profanity, spam, raids, and server-nuking — with reversible, fully-logged actions.

**Architecture:** Node.js + discord.js v14, modular and event-driven. Pure logic (text normalization, link scanning, sliding-rate windows, strike escalation) is isolated into small unit-tested modules. Discord event handlers and slash commands are thin glue around that logic. All thresholds/lists live in one `config.js`; the bot token lives only in a git-ignored `.env`. State (strikes) persists to JSON files.

**Tech Stack:** Node.js 18+, discord.js ^14, Node's built-in test runner (`node --test`), dotenv.

---

## File Structure

```
discordbtot/
├── .env                      # BOT_TOKEN, APP_ID  (git-ignored)
├── .env.example              # committed template
├── config.js                 # all thresholds, lists, IDs (the one file the user edits)
├── index.js                  # client + intents; registers every module + command handler
├── package.json
├── src/
│   ├── core/
│   │   ├── store.js           # JSON read/write (data dir overridable via BOT_DATA_DIR)
│   │   ├── ratewindow.js      # sliding-window event counter (spam/raid/nuke)
│   │   ├── escalate.js        # duration parsing + strike→timeout escalation
│   │   ├── strikes.js         # persisted per-user strike counts
│   │   ├── whitelist.js       # anti-nuke trust + link permission checks
│   │   ├── auditlog.js        # find the executor of a guild event
│   │   └── modlog.js          # send action embeds to the mod-log channel
│   ├── protection/
│   │   ├── normalize.js       # leetspeak/spacing normalization + bad-word match
│   │   ├── linkscan.js        # URL/domain extraction + invite detection
│   │   ├── profanity.js       # messageCreate handler
│   │   ├── links.js           # messageCreate handler
│   │   ├── spam.js            # messageCreate handler (flood + mass-mention)
│   │   ├── antinuke.js        # channel/role/ban/kick + permission-grant watch
│   │   ├── webhooks.js        # webhooksUpdate handler
│   │   ├── antibot.js         # guildMemberAdd (bot accounts)
│   │   └── antiraid.js        # guildMemberAdd (join-flood lockdown)
│   ├── commands/
│   │   ├── index.js           # command collection + interactionCreate dispatch
│   │   ├── register.js        # one-off slash-command registration script
│   │   └── *.js               # one file per command
│   └── data/
│       ├── badwords.json      # starter profanity list (editable)
│       └── scam-domains.json  # known scam / IP-grabber domains
├── test/                      # *.test.js unit tests
└── data/                      # runtime JSON (strikes.json) — auto-created, git-ignored
```

---

## PHASE 1 — Foundation

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `.env.example`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "discord-security-bot",
  "version": "1.0.0",
  "description": "High-protection Discord security bot",
  "main": "index.js",
  "type": "commonjs",
  "scripts": {
    "start": "node index.js",
    "test": "node --test",
    "register": "node src/commands/register.js"
  },
  "engines": { "node": ">=18" },
  "dependencies": {
    "discord.js": "^14.16.3",
    "dotenv": "^16.4.5"
  }
}
```

- [ ] **Step 2: Create `.env.example`**

```bash
# Copy this file to .env and fill in real values. NEVER commit .env.
BOT_TOKEN=your-bot-token-here
APP_ID=1517206448424091738
```

- [ ] **Step 3: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, `package-lock.json` written, no errors.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json .env.example
git commit -m "chore: scaffold project + dependencies"
```

---

### Task 2: `config.js`

**Files:**
- Create: `config.js`

- [ ] **Step 1: Write the config**

```js
// config.js — every threshold, list, and ID lives here. Edit this file to tune the bot.
module.exports = {
  guildId: "",            // your server ID (right-click server icon → Copy Server ID)
  modLogChannelId: "",    // channel where the bot reports every action
  alertRoleId: "",        // role pinged on nuke/raid/critical events (optional)
  trustedUsers: [],       // ANTI-NUKE allowlist: explicit user IDs (you + co-owner) ONLY

  link: {
    allowedRoles: [],     // role IDs allowed to post links freely
    allowedChannels: [],  // channel IDs where links are always allowed
    allowedDomains: ["tenor.com", "giphy.com"], // domains anyone may post
    strikesToBan: 2,      // link strikes before a member is banned
    blockInvites: true,   // treat discord.gg invites as a link strike
  },

  profanity: {
    timeoutSteps: ["5m", "1h", "1d"], // escalating mute lengths per offense
  },

  spam: {
    maxMessages: 5,       // messages...
    perSeconds: 3,        // ...within this many seconds = flood
    maxMentions: 5,       // user/role mentions in one message = mass-mention
    muteMinutes: 10,      // timeout length for spam
  },

  antinuke: {
    maxActions: 3,        // destructive actions...
    perSeconds: 10,       // ...within this window by one user = nuke
    punishment: "ban",    // "ban" or "strip" (strip = remove roles only)
  },

  antiraid: {
    maxJoins: 10,         // joins...
    perSeconds: 30,       // ...within this window = raid
    minAccountAgeDays: 7, // during a raid, accounts younger than this are quarantined
    lockMinutes: 10,      // how long raid lockdown lasts before auto-lift
  },

  mods: {
    roleId: "",           // role allowed to use slash commands (besides admins)
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add config.js
git commit -m "feat: add central config file"
```

---

### Task 3: `src/core/store.js` (JSON persistence)

**Files:**
- Create: `src/core/store.js`
- Test: `test/store.test.js`

- [ ] **Step 1: Write the failing test**

```js
// test/store.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Point the store at a throwaway temp dir BEFORE requiring it.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'botstore-'));
process.env.BOT_DATA_DIR = tmp;
const store = require('../src/core/store');

test('read returns fallback when file is missing', () => {
  assert.deepStrictEqual(store.read('missing.json', { a: 1 }), { a: 1 });
});

test('write then read round-trips data', () => {
  store.write('x.json', { hello: 'world', n: 2 });
  assert.deepStrictEqual(store.read('x.json'), { hello: 'world', n: 2 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/store.test.js`
Expected: FAIL — `Cannot find module '../src/core/store'`.

- [ ] **Step 3: Write the implementation**

```js
// src/core/store.js
const fs = require('node:fs');
const path = require('node:path');

function dataDir() {
  return process.env.BOT_DATA_DIR || path.join(__dirname, '..', '..', 'data');
}

function ensureDir() {
  const dir = dataDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function read(name, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(path.join(ensureDir(), name), 'utf8'));
  } catch {
    return fallback;
  }
}

function write(name, data) {
  const file = path.join(ensureDir(), name);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file); // near-atomic replace
}

module.exports = { read, write, dataDir };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/store.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/store.js test/store.test.js
git commit -m "feat: add JSON store with tests"
```

---

### Task 4: `src/core/ratewindow.js` (sliding-window counter)

**Files:**
- Create: `src/core/ratewindow.js`
- Test: `test/ratewindow.test.js`

- [ ] **Step 1: Write the failing test**

```js
// test/ratewindow.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const RateWindow = require('../src/core/ratewindow');

test('counts events within the window per key', () => {
  const rw = new RateWindow(1000); // 1 second window
  assert.strictEqual(rw.record('u1', 0), 1);
  assert.strictEqual(rw.record('u1', 200), 2);
  assert.strictEqual(rw.record('u1', 400), 3);
});

test('drops events older than the window', () => {
  const rw = new RateWindow(1000);
  rw.record('u1', 0);
  rw.record('u1', 500);
  assert.strictEqual(rw.record('u1', 1600), 1); // first two expired
});

test('keys are independent', () => {
  const rw = new RateWindow(1000);
  rw.record('a', 0);
  assert.strictEqual(rw.record('b', 0), 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/ratewindow.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```js
// src/core/ratewindow.js
// Tracks timestamps per key; record() prunes expired entries and returns the
// current count inside the window. Used by spam, raid, and nuke detection.
class RateWindow {
  constructor(windowMs) {
    this.windowMs = windowMs;
    this.events = new Map();
  }

  record(key, now = Date.now()) {
    const kept = (this.events.get(key) || []).filter((t) => now - t < this.windowMs);
    kept.push(now);
    this.events.set(key, kept);
    return kept.length;
  }

  reset(key) {
    this.events.delete(key);
  }
}

module.exports = RateWindow;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/ratewindow.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/ratewindow.js test/ratewindow.test.js
git commit -m "feat: add sliding-window rate counter with tests"
```

---

### Task 5: `src/core/escalate.js` (duration + escalation)

**Files:**
- Create: `src/core/escalate.js`
- Test: `test/escalate.test.js`

- [ ] **Step 1: Write the failing test**

```js
// test/escalate.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { parseDuration, nextTimeout } = require('../src/core/escalate');

test('parseDuration handles m/h/d', () => {
  assert.strictEqual(parseDuration('5m'), 5 * 60_000);
  assert.strictEqual(parseDuration('1h'), 60 * 60_000);
  assert.strictEqual(parseDuration('1d'), 24 * 60 * 60_000);
});

test('parseDuration returns 0 for bad input', () => {
  assert.strictEqual(parseDuration('nonsense'), 0);
});

test('nextTimeout escalates and caps at the last step', () => {
  const steps = ['5m', '1h', '1d'];
  assert.strictEqual(nextTimeout(1, steps), 5 * 60_000);
  assert.strictEqual(nextTimeout(2, steps), 60 * 60_000);
  assert.strictEqual(nextTimeout(3, steps), 24 * 60 * 60_000);
  assert.strictEqual(nextTimeout(9, steps), 24 * 60 * 60_000); // capped
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/escalate.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```js
// src/core/escalate.js
const UNIT_MS = { m: 60_000, h: 3_600_000, d: 86_400_000 };

function parseDuration(str) {
  const m = /^(\d+)([mhd])$/.exec(String(str).trim());
  return m ? Number(m[1]) * UNIT_MS[m[2]] : 0;
}

// offenseCount is 1-based; clamps to the last configured step.
function nextTimeout(offenseCount, steps) {
  if (!steps.length) return 0;
  const idx = Math.min(Math.max(offenseCount, 1), steps.length) - 1;
  return parseDuration(steps[idx]);
}

module.exports = { parseDuration, nextTimeout };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/escalate.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/escalate.js test/escalate.test.js
git commit -m "feat: add duration parsing + strike escalation with tests"
```

---

### Task 6: `src/core/strikes.js` (persisted counts)

**Files:**
- Create: `src/core/strikes.js`
- Test: `test/strikes.test.js`

- [ ] **Step 1: Write the failing test**

```js
// test/strikes.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.BOT_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'botstrk-'));
const strikes = require('../src/core/strikes');

test('add increments and returns the new count per type', () => {
  assert.strictEqual(strikes.add('user1', 'link'), 1);
  assert.strictEqual(strikes.add('user1', 'link'), 2);
  assert.strictEqual(strikes.add('user1', 'profanity'), 1);
});

test('get returns current counts; reset clears them', () => {
  assert.deepStrictEqual(strikes.get('user1'), { link: 2, profanity: 1 });
  strikes.reset('user1');
  assert.deepStrictEqual(strikes.get('user1'), { link: 0, profanity: 0 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/strikes.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```js
// src/core/strikes.js
const store = require('./store');
const FILE = 'strikes.json';

function all() { return store.read(FILE, {}); }

function add(userId, type) {
  const data = all();
  const u = data[userId] || { link: 0, profanity: 0 };
  u[type] = (u[type] || 0) + 1;
  data[userId] = u;
  store.write(FILE, data);
  return u[type];
}

function get(userId) {
  return { link: 0, profanity: 0, ...all()[userId] };
}

function reset(userId) {
  const data = all();
  delete data[userId];
  store.write(FILE, data);
}

module.exports = { add, get, reset };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/strikes.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/strikes.js test/strikes.test.js
git commit -m "feat: add persisted strike tracking with tests"
```

---

### Task 7: `src/core/modlog.js` + `whitelist.js` + `auditlog.js` (Discord glue)

**Files:**
- Create: `src/core/modlog.js`, `src/core/whitelist.js`, `src/core/auditlog.js`
- Test: `test/whitelist.test.js`

- [ ] **Step 1: Write `src/core/modlog.js`**

```js
// src/core/modlog.js
const { EmbedBuilder } = require('discord.js');
const config = require('../../config');

// Sends a standardized embed to the mod-log channel. Never throws.
async function log(guild, { title, description, color = 0xE67E22, ping = false }) {
  try {
    const channel = guild.channels.cache.get(config.modLogChannelId);
    if (!channel) return;
    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor(color)
      .setTimestamp();
    const content = ping && config.alertRoleId ? `<@&${config.alertRoleId}>` : undefined;
    await channel.send({ content, embeds: [embed] });
  } catch (err) {
    console.error('[modlog] failed:', err.message);
  }
}

module.exports = { log };
```

- [ ] **Step 2: Write the failing test for whitelist**

```js
// test/whitelist.test.js
const { test } = require('node:test');
const assert = require('node:assert');

// Stub config before requiring the module under test.
const Module = require('node:module');
const origResolve = Module._resolveFilename;
const configStub = {
  trustedUsers: ['owner-bypass-id'],
  link: { allowedRoles: ['mod-role'], allowedChannels: ['link-channel'], allowedDomains: [] },
};
require.cache[require.resolve('../config')] = { id: 'cfg', exports: configStub, loaded: true };
const { isTrusted, canPostLinks } = require('../src/core/whitelist');

const fakeMember = (id, ownerId, roleIds = []) => ({
  id,
  guild: { ownerId },
  roles: { cache: { some: (fn) => roleIds.map((rid) => ({ id: rid })).some(fn) } },
});

test('isTrusted: owner and listed users are trusted, others are not', () => {
  assert.strictEqual(isTrusted(fakeMember('x', 'x')), true);          // owner
  assert.strictEqual(isTrusted(fakeMember('owner-bypass-id', 'z')), true); // listed
  assert.strictEqual(isTrusted(fakeMember('rando', 'z')), false);     // admin but not listed
});

test('canPostLinks: allowed role or allowed channel passes', () => {
  assert.strictEqual(canPostLinks(fakeMember('a', 'z', ['mod-role']), 'any'), true);
  assert.strictEqual(canPostLinks(fakeMember('a', 'z', []), 'link-channel'), true);
  assert.strictEqual(canPostLinks(fakeMember('a', 'z', []), 'normal'), false);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test test/whitelist.test.js`
Expected: FAIL — `Cannot find module '../src/core/whitelist'`.

- [ ] **Step 4: Write `src/core/whitelist.js`**

```js
// src/core/whitelist.js
const config = require('../../config');

// ANTI-NUKE trust: ONLY the server owner + explicitly listed users. Admins are
// NOT trusted by default — a nuke usually comes from a compromised admin.
function isTrusted(member) {
  if (!member) return false;
  if (member.id === member.guild?.ownerId) return true;
  return config.trustedUsers.includes(member.id);
}

// LINK permission: trusted roles or allowed channels may post links.
function canPostLinks(member, channelId) {
  if (config.link.allowedChannels.includes(channelId)) return true;
  return member.roles.cache.some((r) => config.link.allowedRoles.includes(r.id));
}

module.exports = { isTrusted, canPostLinks };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/whitelist.test.js`
Expected: PASS (2 tests).

- [ ] **Step 6: Write `src/core/auditlog.js`**

```js
// src/core/auditlog.js
// Finds who performed a moderation-relevant action. The audit-log entry can lag
// the gateway event slightly, so we retry briefly.
async function fetchExecutor(guild, type, targetId = null) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const logs = await guild.fetchAuditLogs({ type, limit: 6 });
      const entry = logs.entries.find(
        (e) => (!targetId || e.target?.id === targetId) && Date.now() - e.createdTimestamp < 10_000,
      );
      if (entry) return { executorId: entry.executor?.id ?? null, executor: entry.executor ?? null };
    } catch {
      /* missing View Audit Log permission or transient error */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return null;
}

module.exports = { fetchExecutor };
```

- [ ] **Step 7: Commit**

```bash
git add src/core/modlog.js src/core/whitelist.js src/core/auditlog.js test/whitelist.test.js
git commit -m "feat: add modlog, whitelist (tested), and audit-log helper"
```

---

### Task 8: `index.js` (client boots and logs in)

**Files:**
- Create: `index.js`

- [ ] **Step 1: Write `index.js`** (module registration stubbed until later phases)

```js
// index.js
require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Events } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,   // privileged
    GatewayIntentBits.GuildMembers,     // privileged
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildWebhooks,
  ],
  partials: [Partials.Channel, Partials.GuildMember],
});

// Protection + command modules are registered here as later phases add them.
const modules = [
  // require('./src/protection/profanity'),
];
for (const mod of modules) {
  try { mod.register(client); } catch (e) { console.error('[load]', e.message); }
}

client.once(Events.ClientReady, (c) => {
  console.log(`✅ Logged in as ${c.user.tag}. Guarding ${c.guilds.cache.size} server(s).`);
});

// Global safety nets so one bad event never crashes the bot.
process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));
process.on('uncaughtException', (e) => console.error('[uncaughtException]', e));

client.login(process.env.BOT_TOKEN);
```

- [ ] **Step 2: Verify it loads without crashing (no token needed)**

Run: `node -e "require('./index.js')"` then press Ctrl+C after ~2s.
Expected: No syntax/module errors. (It will warn about an invalid token if `.env` is empty — that's fine; we only care that the file parses and wires up.)

- [ ] **Step 3: Commit**

```bash
git add index.js
git commit -m "feat: add client bootstrap with intents and safety nets"
```

---

## PHASE 2 — Message protections (profanity + links)

### Task 9: `src/protection/normalize.js` (bad-word matching)

**Files:**
- Create: `src/protection/normalize.js`, `src/data/badwords.json`
- Test: `test/normalize.test.js`

- [ ] **Step 1: Create a starter `src/data/badwords.json`** (edit later as desired)

```json
["fuck", "shit", "bitch", "asshole", "bastard", "dick", "cunt", "slut", "whore", "retard", "faggot", "nigger", "nigga"]
```

- [ ] **Step 2: Write the failing test**

```js
// test/normalize.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { normalize, containsBadWord } = require('../src/protection/normalize');

test('normalize collapses leetspeak, spacing, and repeats', () => {
  assert.strictEqual(normalize('F.U.C.K'), 'fuck');
  assert.strictEqual(normalize('sh1t'), 'shit');
  assert.strictEqual(normalize('fuuuuck'), 'fuck');
  assert.strictEqual(normalize('@ss'), 'as'); // repeats collapsed
});

test('containsBadWord catches obfuscated profanity', () => {
  const words = ['fuck', 'shit'];
  assert.strictEqual(containsBadWord('what the f u c k', words), true);
  assert.strictEqual(containsBadWord('sh!t happens', words), true);
  assert.strictEqual(containsBadWord('have a nice day', words), false);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test test/normalize.test.js`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the implementation**

```js
// src/protection/normalize.js
const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '8': 'b' };

function normalize(text) {
  let s = String(text).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
  s = s.split('').map((c) => LEET[c] || c).join('');
  s = s.replace(/[^a-z]/g, '');     // drop spaces, punctuation, symbols
  s = s.replace(/(.)\1+/g, '$1');   // collapse repeated letters: fuuuck -> fuck
  return s;
}

function containsBadWord(text, words) {
  const n = normalize(text);
  return words.some((w) => {
    const nw = normalize(w);
    return nw.length > 0 && n.includes(nw);
  });
}

module.exports = { normalize, containsBadWord };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/normalize.test.js`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/protection/normalize.js src/data/badwords.json test/normalize.test.js
git commit -m "feat: add profanity normalization + matching with tests"
```

---

### Task 10: `src/protection/linkscan.js` (URL/domain/invite detection)

**Files:**
- Create: `src/protection/linkscan.js`, `src/data/scam-domains.json`
- Test: `test/linkscan.test.js`

- [ ] **Step 1: Create `src/data/scam-domains.json`** (known scam / IP-grabber domains; extend anytime)

```json
["grabify.link", "iplogger.org", "iplogger.com", "2no.co", "yip.su", "iplogger.ru", "blasze.tk", "stopify.co", "ezstat.ru", "discord-nitro.com", "discrod.com", "steamcommunnity.com", "dlscord.gift", "discordgift.site"]
```

- [ ] **Step 2: Write the failing test**

```js
// test/linkscan.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { hasLink, domainsOf, isInvite, isScam } = require('../src/protection/linkscan');

test('hasLink detects urls and bare domains', () => {
  assert.strictEqual(hasLink('check https://youtube.com/watch'), true);
  assert.strictEqual(hasLink('go to example.com please'), true);
  assert.strictEqual(hasLink('no links here at all'), false);
});

test('domainsOf extracts lowercased hostnames without www', () => {
  assert.deepStrictEqual(domainsOf('visit https://www.YouTube.com/x'), ['youtube.com']);
});

test('isInvite detects discord invites', () => {
  assert.strictEqual(isInvite('join discord.gg/abcd'), true);
  assert.strictEqual(isInvite('https://discord.com/invite/xyz'), true);
  assert.strictEqual(isInvite('just chatting'), false);
});

test('isScam matches the blocklist', () => {
  assert.strictEqual(isScam(['grabify.link'], ['grabify.link', 'iplogger.org']), true);
  assert.strictEqual(isScam(['youtube.com'], ['grabify.link']), false);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test test/linkscan.test.js`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the implementation**

```js
// src/protection/linkscan.js
const URL_RE = /(?:https?:\/\/|www\.)?((?:[a-z0-9-]+\.)+[a-z]{2,})(?:[/?#][^\s]*)?/gi;
const INVITE_RE = /(?:discord(?:\.gg|app\.com\/invite|\.com\/invite)|discord\.gg)\/[a-z0-9-]+/i;

function domainsOf(text) {
  const out = [];
  for (const m of String(text).matchAll(URL_RE)) {
    const host = m[1].toLowerCase().replace(/^www\./, '');
    if (!out.includes(host)) out.push(host);
  }
  return out;
}

function hasLink(text) {
  return domainsOf(text).length > 0;
}

function isInvite(text) {
  return INVITE_RE.test(String(text));
}

function isScam(domains, scamList) {
  return domains.some((d) => scamList.includes(d));
}

module.exports = { hasLink, domainsOf, isInvite, isScam };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/linkscan.test.js`
Expected: PASS (4 tests).

> Note: the regex flags `i` and `g` — `matchAll` requires `g`, which `URL_RE` has. If a "RegExp has no /g" error appears, confirm the `g` flag is present.

- [ ] **Step 6: Commit**

```bash
git add src/protection/linkscan.js src/data/scam-domains.json test/linkscan.test.js
git commit -m "feat: add link/domain/invite/scam detection with tests"
```

---

### Task 11: `src/protection/profanity.js` (handler)

**Files:**
- Create: `src/protection/profanity.js`
- Modify: `index.js` (register the module)

- [ ] **Step 1: Write `src/protection/profanity.js`**

```js
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
```

- [ ] **Step 2: Register it in `index.js`**

Modify the `modules` array in `index.js`:

```js
const modules = [
  require('./src/protection/profanity'),
];
```

- [ ] **Step 3: Sanity-load**

Run: `node -e "require('./src/protection/profanity'); console.log('ok')"`
Expected: prints `ok` with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/protection/profanity.js index.js
git commit -m "feat: add profanity handler with escalating timeouts"
```

---

### Task 12: `src/protection/links.js` (handler)

**Files:**
- Create: `src/protection/links.js`
- Modify: `index.js`

- [ ] **Step 1: Write `src/protection/links.js`**

```js
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
```

- [ ] **Step 2: Register it in `index.js`**

```js
const modules = [
  require('./src/protection/profanity'),
  require('./src/protection/links'),
];
```

- [ ] **Step 3: Sanity-load**

Run: `node -e "require('./src/protection/links'); console.log('ok')"`
Expected: prints `ok`.

- [ ] **Step 4: Commit**

```bash
git add src/protection/links.js index.js
git commit -m "feat: add link protection (strikes, scam-ban, invites)"
```

---

## PHASE 3 — Anti-spam (flood + mass-mention)

### Task 13: `src/protection/spam.js`

**Files:**
- Create: `src/protection/spam.js`
- Modify: `index.js`

- [ ] **Step 1: Write `src/protection/spam.js`**

```js
// src/protection/spam.js
const { Events } = require('discord.js');
const RateWindow = require('../core/ratewindow');
const { isTrusted } = require('../core/whitelist');
const modlog = require('../core/modlog');
const config = require('../../config');

function register(client) {
  const flood = new RateWindow(config.spam.perSeconds * 1000);

  async function punish(msg, reason) {
    await msg.delete().catch(() => {});
    if (msg.member?.moderatable) {
      await msg.member.timeout(config.spam.muteMinutes * 60_000, reason).catch(() => {});
    }
    await modlog.log(msg.guild, {
      title: '🔇 Spam muted',
      description: `**User:** ${msg.author.tag} (${msg.author.id})\n**Reason:** ${reason}\n**Mute:** ${config.spam.muteMinutes}m`,
    });
  }

  client.on(Events.MessageCreate, async (msg) => {
    try {
      if (msg.author.bot || !msg.guild) return;
      if (isTrusted(msg.member)) return;

      // Mass-mention: @everyone/@here or too many user/role pings.
      const mentionCount = msg.mentions.users.size + msg.mentions.roles.size;
      if (msg.mentions.everyone || mentionCount >= config.spam.maxMentions) {
        await punish(msg, 'Mass mention');
        return;
      }

      // Flood: too many messages in the window.
      const count = flood.record(msg.author.id);
      if (count > config.spam.maxMessages) {
        await punish(msg, `Flooding (${count} msgs / ${config.spam.perSeconds}s)`);
        flood.reset(msg.author.id);
      }
    } catch (err) {
      console.error('[spam]', err.message);
    }
  });
}

module.exports = { register };
```

- [ ] **Step 2: Register in `index.js`** (append `require('./src/protection/spam')` to `modules`).

- [ ] **Step 3: Sanity-load**

Run: `node -e "require('./src/protection/spam'); console.log('ok')"`
Expected: prints `ok`.

- [ ] **Step 4: Commit**

```bash
git add src/protection/spam.js index.js
git commit -m "feat: add anti-spam (flood mute + mass-mention block)"
```

---

## PHASE 4 — Server shield (anti-nuke, perms, webhooks, anti-bot)

### Task 14: `src/protection/antinuke.js`

**Files:**
- Create: `src/protection/antinuke.js`
- Modify: `index.js`

- [ ] **Step 1: Write `src/protection/antinuke.js`**

```js
// src/protection/antinuke.js
const { Events, AuditLogEvent, PermissionFlagsBits } = require('discord.js');
const RateWindow = require('../core/ratewindow');
const { isTrusted } = require('../core/whitelist');
const { fetchExecutor } = require('../core/auditlog');
const modlog = require('../core/modlog');
const config = require('../../config');

const DANGEROUS = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageWebhooks,
];

function register(client) {
  const window = new RateWindow(config.antinuke.perSeconds * 1000);

  async function handleAction(guild, executorId, label) {
    if (!executorId) return;
    const member = await guild.members.fetch(executorId).catch(() => null);
    if (!member || isTrusted(member) || member.id === client.user.id) return;

    const count = window.record(executorId);
    if (count < config.antinuke.maxActions) return;
    window.reset(executorId);

    // Strip roles first (stops further damage), then ban per config.
    await member.roles.set([], 'Anti-nuke: destructive action burst').catch(() => {});
    let outcome = 'roles stripped';
    if (config.antinuke.punishment === 'ban' && member.bannable) {
      await member.ban({ reason: 'Anti-nuke: nuke attempt' }).catch(() => {});
      outcome = 'roles stripped + BANNED';
    }

    await modlog.log(guild, {
      title: '🛡️ ANTI-NUKE TRIGGERED',
      description: `**User:** ${member.user.tag} (${member.id})\n**Trigger:** ${label} ×${count} in ${config.antinuke.perSeconds}s\n**Action:** ${outcome}`,
      color: 0xE74C3C, ping: true,
    });
  }

  client.on(Events.ChannelDelete, async (ch) => {
    const r = await fetchExecutor(ch.guild, AuditLogEvent.ChannelDelete, ch.id);
    if (r) handleAction(ch.guild, r.executorId, 'channel delete');
  });
  client.on(Events.ChannelCreate, async (ch) => {
    const r = await fetchExecutor(ch.guild, AuditLogEvent.ChannelCreate, ch.id);
    if (r) handleAction(ch.guild, r.executorId, 'channel create');
  });
  client.on(Events.GuildRoleDelete, async (role) => {
    const r = await fetchExecutor(role.guild, AuditLogEvent.RoleDelete, role.id);
    if (r) handleAction(role.guild, r.executorId, 'role delete');
  });
  client.on(Events.GuildBanAdd, async (ban) => {
    const r = await fetchExecutor(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
    if (r) handleAction(ban.guild, r.executorId, 'member ban');
  });
  client.on(Events.GuildMemberRemove, async (member) => {
    const r = await fetchExecutor(member.guild, AuditLogEvent.MemberKick, member.id);
    if (r) handleAction(member.guild, r.executorId, 'member kick');
  });

  // Permission-grant watch: revert dangerous permission additions to a role.
  client.on(Events.GuildRoleUpdate, async (oldRole, newRole) => {
    try {
      const gainedDangerous = DANGEROUS.some(
        (p) => !oldRole.permissions.has(p) && newRole.permissions.has(p),
      );
      if (!gainedDangerous) return;
      const r = await fetchExecutor(newRole.guild, AuditLogEvent.RoleUpdate, newRole.id);
      const member = r?.executorId ? await newRole.guild.members.fetch(r.executorId).catch(() => null) : null;
      if (member && (isTrusted(member) || member.id === client.user.id)) return;

      await newRole.setPermissions(oldRole.permissions, 'Anti-nuke: reverted dangerous permission grant').catch(() => {});
      await modlog.log(newRole.guild, {
        title: '🛡️ Dangerous permission grant reverted',
        description: `**Role:** ${newRole.name}\n**By:** ${member ? member.user.tag : 'unknown'}`,
        color: 0xF1C40F, ping: true,
      });
      if (member) handleAction(newRole.guild, member.id, 'permission grant');
    } catch (err) {
      console.error('[antinuke:roleupdate]', err.message);
    }
  });
}

module.exports = { register };
```

- [ ] **Step 2: Register in `index.js`** (append `require('./src/protection/antinuke')`).

- [ ] **Step 3: Sanity-load**

Run: `node -e "require('./src/protection/antinuke'); console.log('ok')"`
Expected: prints `ok`.

- [ ] **Step 4: Commit**

```bash
git add src/protection/antinuke.js index.js
git commit -m "feat: add anti-nuke + permission-grant watch"
```

---

### Task 15: `src/protection/webhooks.js` + `antibot.js`

**Files:**
- Create: `src/protection/webhooks.js`, `src/protection/antibot.js`
- Modify: `index.js`

- [ ] **Step 1: Write `src/protection/webhooks.js`**

```js
// src/protection/webhooks.js
const { Events, AuditLogEvent } = require('discord.js');
const { isTrusted } = require('../core/whitelist');
const { fetchExecutor } = require('../core/auditlog');
const modlog = require('../core/modlog');

function register(client) {
  client.on(Events.WebhooksUpdate, async (channel) => {
    try {
      const webhooks = await channel.fetchWebhooks().catch(() => null);
      if (!webhooks) return;
      const r = await fetchExecutor(channel.guild, AuditLogEvent.WebhookCreate);
      const member = r?.executorId ? await channel.guild.members.fetch(r.executorId).catch(() => null) : null;
      if (member && (isTrusted(member) || member.id === client.user.id)) return;

      // Delete webhooks created by non-trusted users in this channel.
      for (const wh of webhooks.values()) {
        if (wh.owner && wh.owner.id !== client.user.id && !isTrusted({ id: wh.owner.id, guild: channel.guild, roles: { cache: { some: () => false } } })) {
          await wh.delete('Anti-nuke: untrusted webhook').catch(() => {});
        }
      }
      await modlog.log(channel.guild, {
        title: '🪝 Webhook activity in #' + channel.name,
        description: `Untrusted webhooks removed. By: ${member ? member.user.tag : 'unknown'}`,
        color: 0xF1C40F, ping: true,
      });
    } catch (err) {
      console.error('[webhooks]', err.message);
    }
  });
}

module.exports = { register };
```

- [ ] **Step 2: Write `src/protection/antibot.js`**

```js
// src/protection/antibot.js
const { Events, AuditLogEvent } = require('discord.js');
const { fetchExecutor } = require('../core/auditlog');
const { isTrusted } = require('../core/whitelist');
const modlog = require('../core/modlog');

function register(client) {
  client.on(Events.GuildMemberAdd, async (member) => {
    try {
      if (!member.user.bot) return;
      const r = await fetchExecutor(member.guild, AuditLogEvent.BotAdd, member.id);
      const adder = r?.executorId ? await member.guild.members.fetch(r.executorId).catch(() => null) : null;
      if (adder && isTrusted(adder)) return; // trusted user added it → allow

      await member.kick('Anti-bot: bot added by non-trusted user').catch(() => {});
      await modlog.log(member.guild, {
        title: '🤖 Unauthorized bot kicked',
        description: `**Bot:** ${member.user.tag}\n**Added by:** ${adder ? adder.user.tag : 'unknown'}`,
        color: 0xE74C3C, ping: true,
      });
    } catch (err) {
      console.error('[antibot]', err.message);
    }
  });
}

module.exports = { register };
```

- [ ] **Step 3: Register both in `index.js`** (append `require('./src/protection/webhooks')` and `require('./src/protection/antibot')`).

- [ ] **Step 4: Sanity-load**

Run: `node -e "require('./src/protection/webhooks'); require('./src/protection/antibot'); console.log('ok')"`
Expected: prints `ok`.

- [ ] **Step 5: Commit**

```bash
git add src/protection/webhooks.js src/protection/antibot.js index.js
git commit -m "feat: add webhook protection + anti-bot-add"
```

---

## PHASE 5 — Anti-raid

### Task 16: `src/protection/antiraid.js`

**Files:**
- Create: `src/protection/antiraid.js`
- Modify: `index.js`

- [ ] **Step 1: Write `src/protection/antiraid.js`**

```js
// src/protection/antiraid.js
const { Events, GuildVerificationLevel } = require('discord.js');
const RateWindow = require('../core/ratewindow');
const modlog = require('../core/modlog');
const config = require('../../config');

function register(client) {
  const joins = new RateWindow(config.antiraid.perSeconds * 1000);
  const lockedGuilds = new Set();

  function ageDays(user) {
    return (Date.now() - user.createdTimestamp) / 86_400_000;
  }

  async function lockdown(guild) {
    if (lockedGuilds.has(guild.id)) return;
    lockedGuilds.add(guild.id);
    await guild.setVerificationLevel(GuildVerificationLevel.High, 'Anti-raid lockdown').catch(() => {});
    await modlog.log(guild, {
      title: '🚨 RAID DETECTED — lockdown engaged',
      description: `Verification raised; new young accounts will be quarantined for ${config.antiraid.lockMinutes}m.`,
      color: 0xE74C3C, ping: true,
    });
    setTimeout(async () => {
      lockedGuilds.delete(guild.id);
      await guild.setVerificationLevel(GuildVerificationLevel.Medium, 'Anti-raid lifted').catch(() => {});
      await modlog.log(guild, { title: '✅ Raid lockdown lifted', description: 'Verification restored to Medium.', color: 0x2ECC71 });
    }, config.antiraid.lockMinutes * 60_000);
  }

  client.on(Events.GuildMemberAdd, async (member) => {
    try {
      if (member.user.bot) return;
      const count = joins.record(member.guild.id);
      const raiding = count >= config.antiraid.maxJoins;

      if (raiding) await lockdown(member.guild);

      // During an active lockdown, kick freshly-created accounts.
      if (lockedGuilds.has(member.guild.id) && ageDays(member.user) < config.antiraid.minAccountAgeDays) {
        await member.kick('Anti-raid: new account during raid').catch(() => {});
        await modlog.log(member.guild, {
          title: '👢 Raid account kicked',
          description: `**User:** ${member.user.tag}\n**Account age:** ${ageDays(member.user).toFixed(1)} days`,
        });
      }
    } catch (err) {
      console.error('[antiraid]', err.message);
    }
  });
}

module.exports = { register };
```

- [ ] **Step 2: Register in `index.js`** (append `require('./src/protection/antiraid')`).

- [ ] **Step 3: Sanity-load**

Run: `node -e "require('./src/protection/antiraid'); console.log('ok')"`
Expected: prints `ok`.

- [ ] **Step 4: Commit**

```bash
git add src/protection/antiraid.js index.js
git commit -m "feat: add anti-raid join-flood lockdown"
```

---

## PHASE 6 — Moderation tools (slash commands + panic)

### Task 17: Command framework + registration

**Files:**
- Create: `src/commands/index.js`, `src/commands/register.js`
- Modify: `index.js`

- [ ] **Step 1: Write `src/commands/index.js`** (collection + dispatcher; individual commands added next)

```js
// src/commands/index.js
const { Events, Collection, PermissionFlagsBits, MessageFlags } = require('discord.js');
const config = require('../../config');

const commandModules = [
  require('./lockdown'),
  require('./unlock'),
  require('./strikes'),
  require('./ban'),
  require('./kick'),
  require('./mute'),
  require('./warn'),
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
      if (!isMod(interaction.member)) {
        return interaction.reply({ content: '⛔ You are not allowed to use this.', flags: MessageFlags.Ephemeral });
      }
      await cmd.execute(interaction);
    } catch (err) {
      console.error('[command]', err.message);
      if (!interaction.replied) interaction.reply({ content: '⚠️ Command failed.', flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  });
}

module.exports = { register, commandModules };
```

- [ ] **Step 2: Write `src/commands/register.js`** (run once to publish commands to your guild)

```js
// src/commands/register.js — run: npm run register
require('dotenv').config();
const { REST, Routes } = require('discord.js');
const config = require('../../config');
const { commandModules } = require('./index');

const body = commandModules.map((c) => c.data.toJSON());
const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

(async () => {
  try {
    await rest.put(Routes.applicationGuildCommands(process.env.APP_ID, config.guildId), { body });
    console.log(`✅ Registered ${body.length} commands to guild ${config.guildId}`);
  } catch (err) {
    console.error('Registration failed:', err);
    process.exit(1);
  }
})();
```

- [ ] **Step 3: Register the dispatcher in `index.js`** (append `require('./src/commands')`).

- [ ] **Step 4: Commit**

```bash
git add src/commands/index.js src/commands/register.js index.js
git commit -m "feat: add slash-command framework + registration script"
```

---

### Task 18: Individual commands

**Files:**
- Create: `src/commands/lockdown.js`, `unlock.js`, `strikes.js`, `ban.js`, `kick.js`, `mute.js`, `warn.js`

- [ ] **Step 1: Write `src/commands/lockdown.js`** (the panic button)

```js
// src/commands/lockdown.js
const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const modlog = require('../core/modlog');

module.exports = {
  data: new SlashCommandBuilder().setName('lockdown').setDescription('Lock every text channel (panic button)'),
  async execute(interaction) {
    await interaction.reply({ content: '🔒 Locking down all channels…', flags: MessageFlags.Ephemeral });
    const everyone = interaction.guild.roles.everyone;
    let n = 0;
    for (const ch of interaction.guild.channels.cache.values()) {
      if (ch.type === ChannelType.GuildText) {
        await ch.permissionOverwrites.edit(everyone, { SendMessages: false }, { reason: `Lockdown by ${interaction.user.tag}` }).catch(() => {});
        n++;
      }
    }
    await modlog.log(interaction.guild, { title: '🔒 SERVER LOCKDOWN', description: `By ${interaction.user.tag} — ${n} channels locked.`, color: 0xE74C3C, ping: true });
  },
};
```

- [ ] **Step 2: Write `src/commands/unlock.js`**

```js
// src/commands/unlock.js
const { SlashCommandBuilder, ChannelType, MessageFlags } = require('discord.js');
const modlog = require('../core/modlog');

module.exports = {
  data: new SlashCommandBuilder().setName('unlock').setDescription('Unlock every text channel'),
  async execute(interaction) {
    await interaction.reply({ content: '🔓 Unlocking all channels…', flags: MessageFlags.Ephemeral });
    const everyone = interaction.guild.roles.everyone;
    let n = 0;
    for (const ch of interaction.guild.channels.cache.values()) {
      if (ch.type === ChannelType.GuildText) {
        await ch.permissionOverwrites.edit(everyone, { SendMessages: null }, { reason: `Unlock by ${interaction.user.tag}` }).catch(() => {});
        n++;
      }
    }
    await modlog.log(interaction.guild, { title: '🔓 Server unlocked', description: `By ${interaction.user.tag} — ${n} channels restored.`, color: 0x2ECC71 });
  },
};
```

- [ ] **Step 3: Write `src/commands/strikes.js`**

```js
// src/commands/strikes.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const strikes = require('../core/strikes');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('strikes').setDescription("Show a user's strikes")
    .addUserOption((o) => o.setName('user').setDescription('Target user').setRequired(true)),
  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const s = strikes.get(user.id);
    await interaction.reply({ content: `**${user.tag}** — link: ${s.link}, profanity: ${s.profanity}`, flags: MessageFlags.Ephemeral });
  },
};
```

- [ ] **Step 4: Write `src/commands/ban.js`**

```js
// src/commands/ban.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const modlog = require('../core/modlog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban').setDescription('Ban a user')
    .addUserOption((o) => o.setName('user').setDescription('User to ban').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason')),
  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason given';
    await interaction.guild.members.ban(user.id, { reason }).catch((e) => { throw e; });
    await interaction.reply({ content: `⛔ Banned ${user.tag}.`, flags: MessageFlags.Ephemeral });
    await modlog.log(interaction.guild, { title: '⛔ Manual ban', description: `**User:** ${user.tag}\n**By:** ${interaction.user.tag}\n**Reason:** ${reason}`, color: 0xE74C3C });
  },
};
```

- [ ] **Step 5: Write `src/commands/kick.js`**

```js
// src/commands/kick.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const modlog = require('../core/modlog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick').setDescription('Kick a user')
    .addUserOption((o) => o.setName('user').setDescription('User to kick').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason')),
  async execute(interaction) {
    const member = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason') || 'No reason given';
    if (!member) return interaction.reply({ content: 'User not in server.', flags: MessageFlags.Ephemeral });
    await member.kick(reason);
    await interaction.reply({ content: `👢 Kicked ${member.user.tag}.`, flags: MessageFlags.Ephemeral });
    await modlog.log(interaction.guild, { title: '👢 Manual kick', description: `**User:** ${member.user.tag}\n**By:** ${interaction.user.tag}\n**Reason:** ${reason}`, color: 0xE67E22 });
  },
};
```

- [ ] **Step 6: Write `src/commands/mute.js`**

```js
// src/commands/mute.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const modlog = require('../core/modlog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mute').setDescription('Timeout a user for N minutes')
    .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true))
    .addIntegerOption((o) => o.setName('minutes').setDescription('Minutes').setRequired(true)),
  async execute(interaction) {
    const member = interaction.options.getMember('user');
    const minutes = interaction.options.getInteger('minutes');
    if (!member) return interaction.reply({ content: 'User not in server.', flags: MessageFlags.Ephemeral });
    await member.timeout(minutes * 60_000, `Muted by ${interaction.user.tag}`);
    await interaction.reply({ content: `🔇 Muted ${member.user.tag} for ${minutes}m.`, flags: MessageFlags.Ephemeral });
    await modlog.log(interaction.guild, { title: '🔇 Manual mute', description: `**User:** ${member.user.tag}\n**By:** ${interaction.user.tag}\n**Length:** ${minutes}m`, color: 0xE67E22 });
  },
};
```

- [ ] **Step 7: Write `src/commands/warn.js`**

```js
// src/commands/warn.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const strikes = require('../core/strikes');
const modlog = require('../core/modlog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn').setDescription('Warn a user (adds a link strike)')
    .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason')),
  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason given';
    const count = strikes.add(user.id, 'link');
    await interaction.reply({ content: `⚠️ Warned ${user.tag} (strike ${count}).`, flags: MessageFlags.Ephemeral });
    await modlog.log(interaction.guild, { title: '⚠️ Manual warn', description: `**User:** ${user.tag}\n**By:** ${interaction.user.tag}\n**Strike:** ${count}\n**Reason:** ${reason}`, color: 0xF1C40F });
  },
};
```

- [ ] **Step 8: Sanity-load all commands**

Run: `node -e "require('./src/commands'); console.log('ok')"`
Expected: prints `ok` (this requires every command file to parse).

- [ ] **Step 9: Commit**

```bash
git add src/commands
git commit -m "feat: add lockdown/unlock/strikes/ban/kick/mute/warn commands"
```

---

## PHASE 7 — Setup, live test, and docs

### Task 19: README + setup walkthrough

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`**

````markdown
# Discord Security Bot

High-protection moderation bot: anti-link, anti-profanity, anti-spam, anti-nuke, anti-raid.

## Setup
1. **Create the app/bot** at https://discord.com/developers/applications (App ID `1517206448424091738`).
2. In **Bot** → **Reset Token** → copy it. Create a `.env` file (copy `.env.example`) and paste it as `BOT_TOKEN`. NEVER share this token.
3. In **Bot**, enable **MESSAGE CONTENT INTENT** and **SERVER MEMBERS INTENT**.
4. Install: `npm install`
5. Edit `config.js` — fill in `guildId`, `modLogChannelId`, `trustedUsers` (your user ID), and any allowed link roles/channels.
6. Invite the bot (replace IDs):
   `https://discord.com/oauth2/authorize?client_id=1517206448424091738&scope=bot+applications.commands&permissions=1101927988310`
   Permissions cover: Manage Roles/Channels/Messages/Webhooks, Kick, Ban, Timeout, View Audit Log.
7. **Drag the bot's role near the TOP** of Server Settings → Roles (it can only act on roles below its own).
8. Register slash commands: `npm run register`
9. Start: `npm start`

## How to get IDs
Enable Developer Mode (User Settings → Advanced), then right-click a server/channel/user → **Copy ID**.

## Tuning
Everything (thresholds, word list, whitelists) is in `config.js`, `src/data/badwords.json`, and `src/data/scam-domains.json`.
````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add setup walkthrough"
```

---

### Task 20: Full test run + live integration checklist

**Files:**
- Create: `docs/TEST-CHECKLIST.md`

- [ ] **Step 1: Run the whole unit suite**

Run: `npm test`
Expected: All tests pass (store, ratewindow, escalate, strikes, whitelist, normalize, linkscan).

- [ ] **Step 2: Write `docs/TEST-CHECKLIST.md`** (manual checks on a private test server)

```markdown
# Live Test Checklist (use a throwaway test server)

Prereq: bot online, config filled, role near top, commands registered.

- [ ] Post a bad word as a normal member → message deleted, you get timed out, mod-log entry.
- [ ] Post a link as a normal member → deleted, strike 1 warning. Post again → banned.
- [ ] Post a link as a trusted-role member → allowed.
- [ ] Post `discord.gg/...` invite → treated as a link strike.
- [ ] Send 6 messages in 3s → muted (flood).
- [ ] Send a message mentioning 5+ users / @everyone → deleted + muted.
- [ ] With a second alt account, rapidly delete 3 channels → alt stripped + banned, alert pinged.
- [ ] Grant Administrator to a test role via a non-trusted account → reverted + alert.
- [ ] Add a bot with a non-trusted account → bot kicked.
- [ ] Simulate 10 joins in 30s (or lower thresholds temporarily) → lockdown + verification raised.
- [ ] Run `/lockdown` → all channels locked; `/unlock` → restored.
- [ ] Run `/strikes @user`, `/warn`, `/mute`, `/kick`, `/ban` → each works + logs.
```

- [ ] **Step 3: Commit**

```bash
git add docs/TEST-CHECKLIST.md
git commit -m "docs: add live integration test checklist"
```

---

## Self-Review Notes (spec coverage)

- Profanity (escalating timeout, leetspeak) → Tasks 9, 11. ✅
- Link protection (members blocked, trusted roles free, allowed domains/channels, 2-strike ban, scam instant-ban, invites) → Tasks 10, 12. ✅
- Anti-spam (flood mute, mass-mention) → Task 13. ✅
- Anti-nuke (3 actions/10s → strip+ban, audit-log attribution) + permission-grant watch → Task 14. ✅
- Webhook protection + anti-bot-add → Task 15. ✅
- Anti-raid (10 joins/30s lockdown, young-account quarantine) → Task 16. ✅
- Slash commands + panic/lockdown → Tasks 17, 18. ✅
- Two-whitelist model (trustedUsers vs link roles) → Task 7. ✅
- Mod-log + persistent strikes + audit-log helper + intents/permissions → Tasks 3, 6, 7, 8. ✅
- Setup walkthrough + tests → Tasks 19, 20. ✅

**Note on free-tier limits:** `data/` strike storage is per-process JSON, fine for one server. If you later run multiple shards or want strike history with timestamps, migrate `strikes.js` to SQLite — the interface (`add`/`get`/`reset`) stays the same.
