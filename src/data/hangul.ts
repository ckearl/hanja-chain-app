// ── Text helpers shared by every DataSource ─────────────────────────────

import { type ChainWord } from './types';

// ── Hangul jamo decomposition (folds tense/compound jamo to a base) ──────
const CHO = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
const JUNG = ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ','ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ'];
const CHO_BASE: Record<string, string> = { 'ㄲ':'ㄱ','ㄸ':'ㄷ','ㅃ':'ㅂ','ㅆ':'ㅅ','ㅉ':'ㅈ' };
const JUNG_BASE: Record<string, string> = { 'ㅐ':'ㅐ','ㅒ':'ㅑ','ㅔ':'ㅔ','ㅖ':'ㅕ','ㅘ':'ㅗ','ㅙ':'ㅗ','ㅚ':'ㅗ','ㅝ':'ㅜ','ㅞ':'ㅜ','ㅟ':'ㅜ','ㅢ':'ㅡ' };

export function decompose(syllable: string): { cho: string | null; jung: string | null } {
  const code = (syllable || '').charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return { cho: null, jung: null };
  const cho = CHO[Math.floor(code / 588)];
  const jung = JUNG[Math.floor((code % 588) / 28)];
  return { cho: CHO_BASE[cho] ?? cho, jung: JUNG_BASE[jung] ?? jung };
}

// Escaped so editors/tools can't NFC-normalize U+F900 (豈 compat) into U+8C48,
// which would stretch the range over all of Hangul.
const HANJA_RE = /[\u3400-\u9fff\uf900-\ufaff]/;
export const isHanja = (c: string) => HANJA_RE.test(c);
export const hasLatin = (s: string) => /[a-zA-Z]/.test(s);

// Zip a word's syllables with the Hanja in its hanja form. The syllable comes
// from the WORD (so 樂 reads 낙 in 낙관적 even though its primary sound is 락).
// Alignment is by string index, which holds when the word (minus spaces) and the
// first `/`-alternative of the hanja form are the same length — e.g. 삼국 시대 /
// 三國時代, 붙이기一家. Otherwise (loanword forms like 三角←panties) the syllable
// is left empty.
export function toChainWord(wordKo: string, hanjaForm: string): ChainWord {
  const word = [...wordKo.replace(/\s/g, '')];
  const form = [...hanjaForm.split('/')[0]];
  const aligned = word.length === form.length;
  const syllables: ChainWord['syllables'] = [];
  form.forEach((ch, i) => {
    if (isHanja(ch)) syllables.push({ syllable: aligned ? word[i] : '', hanja: ch });
  });
  return { wordKo, hanjaForm, syllables };
}
