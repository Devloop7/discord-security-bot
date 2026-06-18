// src/protection/normalize.js
const LEET = { '0': 'o', '1': 'i', '!': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '8': 'b' };

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
