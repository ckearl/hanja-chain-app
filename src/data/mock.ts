// ── Mock DataSource ─────────────────────────────────────────────────────
// Real Korean/Hanja data from the design mock, wired through the async
// DataSource interface. Superseded by the SQLite source (sqlite.ts); kept as a
// fixture — screens import the interface, never this file directly.

import { decompose, hasLatin, isHanja, toChainWord } from './hangul';
import {
  type Compound,
  type DataSource,
  type GalleryFilter,
  type HanjaChar,
  type Reading,
  type SearchMode,
} from './types';

// ── Seed: [hanja, primarySound, meaningKo, meaningEn, level, extraReadings] ─
type Seed = [string, string, string, string, string, string[]?];
const CHAR_SEED: Seed[] = [
  ['學', '학', '배울', 'learning, to study', '8급'],
  ['江', '강', '강', 'river', '7급Ⅱ'],
  ['强', '강', '강할', 'strong', '6급'],
  ['愛', '애', '사랑', 'love', '6급'],
  ['國', '국', '나라', 'country', '8급'],
  ['語', '어', '말씀', 'language, speech', '7급'],
  ['心', '심', '마음', 'heart, mind', '7급'],
  ['力', '력', '힘', 'power, strength', '7급Ⅱ'],
  ['水', '수', '물', 'water', '8급'],
  ['火', '화', '불', 'fire', '8급'],
  ['木', '목', '나무', 'tree, wood', '8급'],
  ['金', '금', '쇠', 'gold, metal', '8급', ['김']],
  ['人', '인', '사람', 'person', '8급'],
  ['大', '대', '큰', 'big, great', '8급'],
  ['山', '산', '메', 'mountain', '8급'],
  ['海', '해', '바다', 'sea', '7급Ⅱ'],
  ['時', '시', '때', 'time', '7급Ⅱ'],
  ['食', '식', '먹을', 'eat, food', '7급Ⅱ'],
  ['四', '사', '넉', 'four', '8급'],
  ['死', '사', '죽을', 'to die', '6급'],
  ['思', '사', '생각할', 'to think', '5급'],
  ['師', '사', '스승', 'teacher, master', '4급Ⅱ'],
  ['事', '사', '일', 'affair, matter', '7급Ⅱ'],
  ['校', '교', '학교', 'school', '8급'],
  ['生', '생', '날', 'birth, life', '8급'],
  ['問', '문', '물을', 'to ask', '7급'],
  ['者', '자', '놈', 'person, -er', '6급'],
  ['樂', '락', '즐길', 'joy; music; to like', '6급Ⅱ', ['악', '요']],
  ['觀', '관', '볼', 'to view, observe', '5급Ⅱ'],
  ['的', '적', '과녁', 'target; -tic', '5급Ⅱ'],
  ['園', '원', '동산', 'garden', '6급'],
  ['快', '쾌', '쾌할', 'pleasant, cheerful', '4급Ⅱ'],
  ['音', '음', '소리', 'sound', '6급Ⅱ'],
  ['公', '공', '공평할', 'public, fair', '6급Ⅱ'],
  ['庭', '정', '뜰', 'courtyard, garden', '6급Ⅱ'],
  ['藝', '예', '재주', 'art, skill', '4급Ⅱ'],
  ['天', '천', '하늘', 'heaven, sky', '7급'],
  ['光', '광', '빛', 'light', '6급Ⅱ'],
  ['念', '념', '생각', 'thought, idea', '5급Ⅱ'],
  ['目', '목', '눈', 'eye, goal', '6급'],
];

// ── Seed: [wordKo, hanjaForm, englishGloss?, definitionKo?] ──────────────
type WordSeed = [string, string, string?, string?];
const WORD_SEED: WordSeed[] = [
  // 學 family
  ['학교', '學校', 'school', '일정한 목적·교과 과정·시설을 갖추고 학생을 가르치는 기관.'],
  ['학생', '學生', 'student', '학교에 다니면서 공부하는 사람.'],
  ['학문', '學問', 'scholarship, learning'],
  ['학자', '學者', 'scholar'],
  ['대학', '大學', 'university, college'],
  ['입학', '入學', 'school admission'],
  ['학년', '學年', 'school year, grade'],
  // 江 / 强 / 愛 / 國 / 語 / 心 / 力
  ['강산', '江山', 'rivers and mountains'],
  ['강력', '强力', 'powerful, strong'],
  ['애정', '愛情', 'affection'],
  ['국어', '國語', 'national / Korean language'],
  ['언어', '言語', 'language'],
  ['관심', '關心', 'interest, concern'],
  ['중심', '中心', 'center'],
  ['능력', '能力', 'ability'],
  ['노력', '努力', 'effort'],
  // 水 / 火 / 木 / 金 / 人 / 大 / 山 / 海 / 時 / 食
  ['수영', '水泳', 'swimming'],
  ['화산', '火山', 'volcano'],
  ['목재', '木材', 'timber, lumber'],
  ['현금', '現金', 'cash'],
  ['인간', '人間', 'human being'],
  ['위대', '偉大', 'greatness'],
  ['등산', '登山', 'hiking, mountaineering'],
  ['해변', '海邊', 'beach, seaside'],
  ['시간', '時間', 'time'],
  ['식사', '食事', 'meal'],
  ['음식', '飮食', 'food'],
  // 四 / 死 / 思 / 師 / 事 family (사)
  ['사방', '四方', 'all directions'],
  ['사계', '四季', 'four seasons'],
  ['사망', '死亡', 'death'],
  ['생사', '生死', 'life and death'],
  ['사고', '思考', 'thinking'],
  ['교사', '敎師', 'teacher'],
  ['사건', '事件', 'incident, case'],
  // Chains graph (樂 / 觀 / 的 / 園 ...)
  ['낙관적', '樂觀的', 'optimistic'],
  ['낙천적', '樂天的', 'optimistic (by nature)'],
  ['낙원', '樂園', 'paradise'],
  ['쾌락', '快樂', 'pleasure'],
  ['음악', '音樂', 'music'],
  ['공원', '公園', 'park'],
  ['정원', '庭園', 'garden'],
  ['원예', '園藝', 'gardening, horticulture'],
  ['관광', '觀光', 'sightseeing, tourism'],
  ['관념', '觀念', 'notion, concept'],
  ['목적', '目的', 'purpose, goal'],
];

// ── Build in-memory tables ──────────────────────────────────────────────
function buildReadings(primary: string, extra: string[], meaningKo: string): Reading[] {
  const all = [primary, ...extra];
  return all.map((r, i) => ({
    reading: r,
    meaningKo: i === 0 ? meaningKo : null,
    isPrimary: r === primary,
  }));
}

const CHARS = new Map<string, HanjaChar>();
for (const [hanja, sound, mKo, mEn, level, extra = []] of CHAR_SEED) {
  CHARS.set(hanja, {
    hanja,
    primarySound: sound,
    meaningKo: mKo,
    meaningEn: mEn,
    level,
    isCore: true,
    coreLevel: 'middle',
    radical: null,
    strokes: null,
    totalStrokes: null,
    readings: buildReadings(sound, extra, mKo),
  });
}

const COMPOUNDS: Compound[] = WORD_SEED.map(([wordKo, hanjaForm, gloss, defKo], i) => {
  const hanjaChars = [...hanjaForm].filter(isHanja);
  return {
    id: i + 1,
    wordKo,
    wordKoRaw: wordKo,
    hanjaForm,
    pos: null,
    definitionKo: defKo ?? null,
    definitionEn: null,
    englishGloss: gloss ?? null,
    hasEnglish: !!gloss,
    chars: hanjaChars.map((hanja, position) => ({ hanja, position })),
  };
});

// hanja -> compounds containing it
const BY_HANJA = new Map<string, Compound[]>();
for (const c of COMPOUNDS) {
  for (const { hanja } of c.chars) {
    if (!BY_HANJA.has(hanja)) BY_HANJA.set(hanja, []);
    BY_HANJA.get(hanja)!.push(c);
  }
}

const rank = (a: Compound, b: Compound) =>
  Number(b.hasEnglish) - Number(a.hasEnglish) || a.hanjaForm.length - b.hanjaForm.length;

const toChain = (c: Compound) => toChainWord(c.wordKo, c.hanjaForm);

const RECENT_HANJA = ['學', '江', '心', '愛'];

export const mockSource: DataSource = {
  async getCharacter(hanja) {
    return CHARS.get(hanja);
  },

  async compoundsForChar(hanja, limit) {
    const list = (BY_HANJA.get(hanja) ?? []).slice().sort(rank);
    return limit ? list.slice(0, limit) : list;
  },

  async search(query, mode: SearchMode = 'auto') {
    const q = query.trim();
    if (!q) return [];
    let m = mode;
    if (m === 'auto') m = [...q].some(isHanja) ? 'hanja' : hasLatin(q) ? 'english' : 'korean';

    const results = new Map<string, HanjaChar>();
    const add = (h?: HanjaChar) => h && results.set(h.hanja, h);

    if (m === 'hanja') {
      for (const ch of q) add(CHARS.get(ch));
    } else if (m === 'english') {
      const lq = q.toLowerCase();
      for (const ch of CHARS.values()) {
        if ((ch.meaningEn ?? '').toLowerCase().includes(lq)) add(ch);
      }
    } else {
      // korean: match a reading/sound, or a whole word (-> its chars)
      for (const ch of CHARS.values()) {
        if (ch.primarySound === q || ch.readings.some((r) => r.reading === q)) add(ch);
        if ((ch.meaningKo ?? '').includes(q)) add(ch);
      }
      for (const c of COMPOUNDS) {
        if (c.wordKo === q || c.wordKo.startsWith(q)) {
          for (const { hanja } of c.chars) add(CHARS.get(hanja));
        }
      }
    }
    return [...results.values()];
  },

  async charactersByReading(filter: GalleryFilter) {
    const all = [...CHARS.values()];
    return all
      .filter((ch) => {
        if (filter.syllable) return ch.primarySound === filter.syllable;
        const { cho, jung } = decompose(ch.primarySound);
        if (filter.cho && cho !== filter.cho) return false;
        if (filter.jung && jung !== filter.jung) return false;
        return true;
      })
      .sort((a, b) => a.primarySound.localeCompare(b.primarySound, 'ko'));
  },

  async chainNeighbors(hanja, excludeWord) {
    return (BY_HANJA.get(hanja) ?? [])
      .filter((c) => c.wordKo !== excludeWord)
      .sort(rank)
      .map(toChain);
  },

  async toChainWord(wordKo) {
    const c = COMPOUNDS.find((x) => x.wordKo === wordKo);
    return c ? toChain(c) : undefined;
  },

  async recent() {
    return RECENT_HANJA.map((h) => CHARS.get(h)).filter(Boolean) as HanjaChar[];
  },
};
