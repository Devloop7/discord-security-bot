// src/protection/normalize.js
const LEET = { '0': 'o', '1': 'i', '!': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '8': 'b' };

function normalize(text) {
  let s = String(text).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
  s = s.split('').map((c) => LEET[c] || c).join('');
  s = s.replace(/[^a-z]/g, '');     // drop spaces, punctuation, symbols
  s = s.replace(/(.)\1+/g, '$1');   // collapse repeated letters: fuuuck -> fuck
  return s;
}

// normalize a single token: leet-map, strip to a-z0-9, collapse repeats
function normToken(w) {
  let s = String(w).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
  s = s.split('').map((c) => LEET[c] || c).join('');
  s = s.replace(/[^a-z0-9]/g, '');
  s = s.replace(/(.)\1+/g, '$1');
  return s;
}

// split into normalized tokens (keep leet chars @ $ ! * inside tokens so "sh!t"/"f.u.c.k" tokenize right)
function tokenize(text) {
  return String(text).toLowerCase().split(/[^a-z0-9@$!*]+/i).map(normToken).filter(Boolean);
}

// candidate set = tokens + concatenation of any run of >1 consecutive single-char tokens (catches "f u c k" / "f.u.c.k")
function candidates(text) {
  const toks = tokenize(text);
  const set = new Set(toks);
  let run = [];
  for (const t of toks) {
    if (t.length === 1) run.push(t);
    else { if (run.length > 1) set.add(run.join('')); run = []; }
  }
  if (run.length > 1) set.add(run.join(''));
  return set;
}

function containsBadWord(text, words, whitelist = []) {
  const cand = candidates(text);
  const wl = new Set(whitelist.map(normToken));
  for (const w of words) {
    const nw = normToken(w);
    if (nw && cand.has(nw) && !wl.has(nw)) return true;
  }
  return false;
}

module.exports = { normalize, normToken, tokenize, candidates, containsBadWord };
