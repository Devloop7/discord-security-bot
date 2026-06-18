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
