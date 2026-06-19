// src/tickets/transcript.js — generate an HTML transcript from a ticket channel.
'use strict';

/**
 * HTML-escape a string so dynamic content cannot break the document.
 */
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Format a Discord timestamp (ms) as "YYYY-MM-DD HH:MM:SS" (UTC).
 */
function fmtTs(ts) {
  return new Date(ts).toISOString().replace('T', ' ').slice(0, 19);
}

/**
 * generateHtml(channel)
 * Fetches ALL messages from a Discord text channel (oldest → newest),
 * builds a dark Discord-style HTML document, and returns:
 *   { buffer: Buffer, filename: string }
 */
async function generateHtml(channel) {
  // ── Fetch all messages ─────────────────────────────────────────────────────
  const messages = [];
  let before = undefined;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const opts = { limit: 100 };
    if (before) opts.before = before;

    const batch = await channel.messages.fetch(opts);
    if (!batch.size) break;

    batch.forEach((m) => messages.push(m));

    if (batch.size < 100) break;

    // Track the oldest message id as the cursor for the next page.
    before = batch.last()?.id;
    if (!before) break;
  }

  // Sort ascending (oldest first).
  messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  // ── Build HTML rows ────────────────────────────────────────────────────────
  const rows = messages.map((msg) => {
    const ts = esc(fmtTs(msg.createdTimestamp));
    const author = esc(msg.author?.tag ?? msg.author?.username ?? 'Unknown');

    let content;
    if (msg.content) {
      content = esc(msg.content);
    } else if (msg.embeds?.length) {
      content = '<em>[embed]</em>';
    } else if (msg.attachments?.size) {
      content = '<em>[attachment]</em>';
    } else {
      content = '';
    }

    return `
      <tr>
        <td class="ts">${ts}</td>
        <td class="author">${author}</td>
        <td class="msg">${content}</td>
      </tr>`;
  }).join('');

  // ── Build full HTML document ────────────────────────────────────────────────
  const channelName = esc(channel.name ?? channel.id);
  const generatedAt = esc(new Date().toISOString().replace('T', ' ').slice(0, 19));

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Transcript — ${channelName}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 16px;
      background: #36393f;
      color: #dcddde;
      font-family: Whitney, "Helvetica Neue", Helvetica, Arial, sans-serif;
      font-size: 14px;
    }
    h1 {
      color: #ffffff;
      font-size: 1.2rem;
      margin: 0 0 4px;
    }
    .meta {
      color: #72767d;
      font-size: 0.8rem;
      margin-bottom: 16px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    thead tr {
      background: #2f3136;
    }
    th {
      padding: 8px 10px;
      text-align: left;
      color: #b9bbbe;
      font-weight: 600;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    tbody tr:hover {
      background: #32353b;
    }
    td {
      padding: 6px 10px;
      vertical-align: top;
      border-bottom: 1px solid #2f3136;
    }
    td.ts {
      color: #72767d;
      white-space: nowrap;
      font-size: 0.78rem;
      width: 160px;
    }
    td.author {
      color: #7289da;
      white-space: nowrap;
      width: 180px;
      font-weight: 600;
    }
    td.msg {
      word-break: break-word;
    }
    em {
      color: #72767d;
      font-style: italic;
    }
  </style>
</head>
<body>
  <h1>#${channelName} — Transcript</h1>
  <p class="meta">Generated ${generatedAt} UTC &mdash; ${messages.length} message${messages.length !== 1 ? 's' : ''}</p>
  <table>
    <thead>
      <tr>
        <th>Timestamp (UTC)</th>
        <th>Author</th>
        <th>Message</th>
      </tr>
    </thead>
    <tbody>
      ${rows || '<tr><td colspan="3" style="color:#72767d;font-style:italic;">No messages found.</td></tr>'}
    </tbody>
  </table>
</body>
</html>`;

  return {
    buffer: Buffer.from(html, 'utf8'),
    filename: `ticket-${channel.id}.html`,
  };
}

module.exports = { generateHtml };
