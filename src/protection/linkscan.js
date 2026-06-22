// src/protection/linkscan.js
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;
const INVITE_RE = /(?:discord(?:\.gg|app\.com\/invite|\.com\/invite)|discord\.gg)\/[a-z0-9-]+/i;

function domainsOf(text) {
  const out = [];
  for (const m of String(text).matchAll(URL_RE)) {
    // strip scheme (https:// or http://)
    let raw = m[0].replace(/^https?:\/\//i, '');
    // strip leading www.
    raw = raw.replace(/^www\./i, '');
    // cut at first / ? or #
    const host = raw.split(/[/?#]/)[0].toLowerCase();
    if (host && !out.includes(host)) out.push(host);
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
