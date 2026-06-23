// src/tickets/transcript.js — generate a premium HTML transcript for a ticket.
//
// Produces a modern, Discord-like dark document: a header card with metadata,
// avatars, author grouping (consecutive messages collapse under one header),
// rendered embeds + attachments, and the bot's indigo accent. Returns
// { buffer, filename, count } so callers can show the message count.
'use strict';

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtTs(ts) {
  return new Date(ts).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

// Minimal, safe Markdown → HTML for message content (escape first, then render).
function renderContent(raw) {
  let s = esc(raw);
  // fenced code blocks
  s = s.replace(/```([\s\S]*?)```/g, (_, code) => `<pre>${code.replace(/^\n+|\n+$/g, '')}</pre>`);
  // inline code
  s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  // bold / italic / strike
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/__([^_]+)__/g, '<u>$1</u>');
  s = s.replace(/~~([^~]+)~~/g, '<s>$1</s>');
  // links + bare URLs (operate on escaped text, so quotes are &#39; etc.)
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  s = s.replace(/(^|[^"=>])(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
  // mentions → subtle chips
  s = s.replace(/&lt;@!?(\d+)&gt;/g, '<span class="mention">@user</span>');
  s = s.replace(/&lt;@&amp;(\d+)&gt;/g, '<span class="mention">@role</span>');
  s = s.replace(/&lt;#(\d+)&gt;/g, '<span class="mention">#channel</span>');
  // newlines
  s = s.replace(/\n/g, '<br>');
  return s;
}

function avatarUrl(msg) {
  try {
    return msg.author?.displayAvatarURL?.({ extension: 'png', size: 64 }) || '';
  } catch { return ''; }
}

function authorColor(msg) {
  const c = msg.member?.displayHexColor;
  return c && c !== '#000000' ? c : '#c9cdf6';
}

function renderEmbed(embed) {
  const color = typeof embed.color === 'number'
    ? '#' + embed.color.toString(16).padStart(6, '0')
    : '#6366f1';
  const title = embed.title ? `<div class="e-title">${esc(embed.title)}</div>` : '';
  const desc = embed.description ? `<div class="e-desc">${renderContent(embed.description)}</div>` : '';
  const fields = (embed.fields || []).map((f) =>
    `<div class="e-field"><div class="e-fname">${esc(f.name)}</div><div class="e-fval">${renderContent(f.value)}</div></div>`,
  ).join('');
  return `<div class="embed" style="border-left-color:${color}">${title}${desc}${fields ? `<div class="e-fields">${fields}</div>` : ''}</div>`;
}

function renderAttachments(msg) {
  if (!msg.attachments?.size) return '';
  const items = [...msg.attachments.values()].map((a) => {
    const isImg = /^image\//.test(a.contentType || '') || /\.(png|jpe?g|gif|webp)$/i.test(a.name || '');
    if (isImg) return `<a href="${esc(a.url)}" target="_blank" rel="noopener"><img class="att-img" src="${esc(a.url)}" alt="${esc(a.name)}"></a>`;
    return `<a class="att-file" href="${esc(a.url)}" target="_blank" rel="noopener">📎 ${esc(a.name)}</a>`;
  }).join('');
  return `<div class="atts">${items}</div>`;
}

function renderMessageBody(msg) {
  const text = msg.content ? `<div class="text">${renderContent(msg.content)}</div>` : '';
  const embeds = (msg.embeds || []).map(renderEmbed).join('');
  const atts = renderAttachments(msg);
  const body = text + embeds + atts;
  return body || '<div class="text muted"><em>[no text content]</em></div>';
}

async function generateHtml(channel) {
  // Fetch all messages (oldest → newest).
  const messages = [];
  let before;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const opts = { limit: 100 };
    if (before) opts.before = before;
    const batch = await channel.messages.fetch(opts);
    if (!batch.size) break;
    batch.forEach((m) => messages.push(m));
    if (batch.size < 100) break;
    before = batch.last()?.id;
    if (!before) break;
  }
  messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  // Group consecutive messages by the same author within 7 minutes.
  const groups = [];
  const GAP = 7 * 60 * 1000;
  for (const m of messages) {
    const last = groups[groups.length - 1];
    if (last && last.authorId === m.author?.id && (m.createdTimestamp - last.ts) < GAP) {
      last.messages.push(m);
      last.ts = m.createdTimestamp;
    } else {
      groups.push({
        authorId: m.author?.id,
        authorTag: m.author?.tag || m.author?.username || 'Unknown',
        avatar: avatarUrl(m),
        color: authorColor(m),
        startTs: m.createdTimestamp,
        ts: m.createdTimestamp,
        bot: !!m.author?.bot,
        messages: [m],
      });
    }
  }

  const groupsHtml = groups.map((g) => {
    const initial = esc((g.authorTag[0] || '?').toUpperCase());
    const avatar = g.avatar
      ? `<img class="avatar" src="${esc(g.avatar)}" alt="">`
      : `<div class="avatar avatar-fallback">${initial}</div>`;
    const botTag = g.bot ? '<span class="bot-tag">BOT</span>' : '';
    const body = g.messages.map((m) => `<div class="msg">${renderMessageBody(m)}</div>`).join('');
    return `
      <div class="group">
        ${avatar}
        <div class="group-body">
          <div class="group-head">
            <span class="author" style="color:${g.color}">${esc(g.authorTag)}</span>${botTag}
            <span class="time">${esc(fmtTs(g.startTs))}</span>
          </div>
          ${body}
        </div>
      </div>`;
  }).join('');

  const guild = channel.guild;
  const serverIcon = (() => { try { return guild?.iconURL?.({ extension: 'png', size: 128 }) || ''; } catch { return ''; } })();
  const channelName = esc(channel.name ?? channel.id);
  const serverName = esc(guild?.name ?? 'Server');
  const generatedAt = esc(fmtTs(Date.now()));
  const count = messages.length;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Transcript — #${channelName}</title>
<style>
  :root{
    --bg:#0f1014; --panel:#16171d; --panel-2:#1c1d24; --line:#23252e;
    --text:#dcdef0; --muted:#8a8fa3; --brand:#6366f1; --brand-2:#8b5cf6;
  }
  *,*::before,*::after{box-sizing:border-box}
  body{margin:0;background:radial-gradient(1200px 600px at 50% -10%,#1a1b27 0%,var(--bg) 60%);color:var(--text);
    font-family:"gg sans","Helvetica Neue",Helvetica,Arial,sans-serif;font-size:15px;line-height:1.45;padding:32px 16px}
  .wrap{max-width:880px;margin:0 auto}
  .card{background:linear-gradient(180deg,var(--panel) 0%,var(--panel-2) 100%);border:1px solid var(--line);
    border-radius:16px;padding:24px 28px;margin-bottom:24px;display:flex;align-items:center;gap:18px;
    box-shadow:0 12px 40px rgba(0,0,0,.35)}
  .card .sicon{width:64px;height:64px;border-radius:18px;object-fit:cover;border:1px solid var(--line)}
  .card .sicon-fallback{width:64px;height:64px;border-radius:18px;display:flex;align-items:center;justify-content:center;
    background:linear-gradient(135deg,var(--brand),var(--brand-2));font-size:26px;font-weight:700;color:#fff}
  .card h1{margin:0 0 4px;font-size:20px;font-weight:700;letter-spacing:.2px}
  .card .sub{color:var(--muted);font-size:13px}
  .card .pill{display:inline-block;margin-top:8px;padding:3px 10px;border-radius:999px;background:rgba(99,102,241,.15);
    color:#c3c6ff;font-size:12px;font-weight:600;border:1px solid rgba(99,102,241,.3)}
  .log{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:8px 4px}
  .group{display:flex;gap:14px;padding:10px 18px;border-radius:10px}
  .group:hover{background:rgba(255,255,255,.02)}
  .avatar{width:42px;height:42px;border-radius:50%;object-fit:cover;flex:0 0 auto}
  .avatar-fallback{display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,var(--brand),var(--brand-2));
    color:#fff;font-weight:700}
  .group-body{min-width:0;flex:1}
  .group-head{display:flex;align-items:baseline;gap:10px;margin-bottom:2px}
  .author{font-weight:600}
  .bot-tag{background:var(--brand);color:#fff;font-size:10px;font-weight:700;padding:1px 5px;border-radius:4px;letter-spacing:.5px}
  .time{color:var(--muted);font-size:12px}
  .msg{margin:2px 0}
  .text{word-break:break-word;white-space:normal}
  .text.muted{color:var(--muted)}
  .mention{background:rgba(99,102,241,.2);color:#c3c6ff;border-radius:4px;padding:0 3px}
  code{background:#0c0d12;border:1px solid var(--line);border-radius:4px;padding:1px 5px;font-family:Consolas,monospace;font-size:13px}
  pre{background:#0c0d12;border:1px solid var(--line);border-radius:8px;padding:12px 14px;overflow:auto;
    font-family:Consolas,monospace;font-size:13px;white-space:pre-wrap;word-break:break-word}
  a{color:#8aa0ff;text-decoration:none}a:hover{text-decoration:underline}
  .embed{background:var(--panel-2);border-left:4px solid var(--brand);border-radius:6px;padding:10px 14px;margin:6px 0;max-width:520px}
  .e-title{font-weight:700;margin-bottom:4px}
  .e-desc{color:#c4c7d4;font-size:14px}
  .e-fields{display:flex;flex-wrap:wrap;gap:10px;margin-top:8px}
  .e-field{min-width:120px}
  .e-fname{font-weight:600;font-size:13px}
  .e-fval{color:#c4c7d4;font-size:13px}
  .atts{margin-top:6px;display:flex;flex-wrap:wrap;gap:8px}
  .att-img{max-width:320px;max-height:240px;border-radius:8px;border:1px solid var(--line)}
  .att-file{display:inline-block;background:var(--panel-2);border:1px solid var(--line);border-radius:8px;padding:8px 12px}
  .foot{text-align:center;color:var(--muted);font-size:12px;margin-top:18px}
  .empty{color:var(--muted);text-align:center;padding:40px;font-style:italic}
</style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      ${serverIcon ? `<img class="sicon" src="${serverIcon}" alt="">` : `<div class="sicon-fallback">${esc((serverName[0] || '?').toUpperCase())}</div>`}
      <div>
        <h1>#${channelName}</h1>
        <div class="sub">${serverName} &middot; Generated ${generatedAt}</div>
        <span class="pill">${count} message${count !== 1 ? 's' : ''}</span>
      </div>
    </div>
    <div class="log">
      ${groupsHtml || '<div class="empty">No messages found.</div>'}
    </div>
    <div class="foot">Transcript generated by the support system</div>
  </div>
</body>
</html>`;

  return { buffer: Buffer.from(html, 'utf8'), filename: `ticket-${channel.id}.html`, count };
}

module.exports = { generateHtml };
