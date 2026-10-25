// ── Domain types — mirror the final SQLite schema (already frozen) ──────
// When the pipeline finishes, the mock DataSource is replaced by a SQLite one
// returning these exact shapes; screens don't change.

export type CoreLevel = 'middle' | 'high' | null;

export type Reading = {
  reading: string;
  meaningKo: string | null;
  isPrimary: boolean;
};

export type HanjaChar = {
  hanja: string;
  primarySound: string;
  meaningKo: string | null; // e.g. '배울'
  meaningEn: string | null; // e.g. 'learning, knowledge'
  level: string | null; // 한국어문회 grade, e.g. '8급'
  isCore: boolean;
  coreLevel: CoreLevel;
  radical: string | null;
  strokes: number | null;
  totalStrokes: number | null;
  readings: Reading[];
};

// One Hanja position within a compound's chain (drives Chains traversal).
export type CompoundChar = { hanja: string; position: number };

export type Compound = {
  id: number;
  wordKo: string; // normalized, no ^ or -
  wordKoRaw: string | null; // original display form
  hanjaForm: string; // e.g. 學校
  pos: string | null;
  definitionKo: string | null;
  definitionEn: string | null;
  englishGloss: string | null; // concise, e.g. 'school'
  hasEnglish: boolean;
  chars: CompoundChar[]; // decomposed hanja chain with positions
};

// A node in the Chains graph: a word + its ordered syllable↔hanja pairs.
export type ChainWord = {
  wordKo: string;
  hanjaForm: string;
  syllables: { syllable: string; hanja: string }[];
};

export type SearchMode = 'auto' | 'hanja' | 'korean' | 'english';

export type GalleryFilter = {
  cho?: string | null; // initial consonant (folded)
  jung?: string | null; // medial vowel (folded)
  syllable?: string | null; // full syllable
};

// Lightweight row for browsing every character at once (Gallery grid + its
// filter chips) — no readings join, so all ~1,800 load in one cheap query.
export type GalleryEntry = {
  hanja: string;
  primarySound: string;
  meaningKo: string | null;
  level: string | null; // 한국어문회 grade, e.g. '8급' (Daily picks from the easy grades)
};

// Stroke-order graphics in a 1024-unit box with y pointing up (baseline at
// y=900 from the top): draw inside <G transform="scale(1,-1) translate(0,-900)">.
export type StrokeOrder = {
  strokes: string[]; // SVG outline path per stroke, in writing order
  medians: [number, number][][]; // centerline polyline per stroke, start → end
};

// The interface every screen depends on. Async so the SQLite implementation
// (queries) is a drop-in replacement for the mock.
export interface DataSource {
  getCharacter(hanja: string): Promise<HanjaChar | undefined>;
  compoundsForChar(hanja: string, limit?: number): Promise<Compound[]>;
  search(query: string, mode?: SearchMode): Promise<HanjaChar[]>;
  charactersByReading(filter: GalleryFilter): Promise<HanjaChar[]>;
  // Every character as a GalleryEntry, ordered by primary sound (가나다) then hanja.
  galleryIndex(): Promise<GalleryEntry[]>;
  // Words that share the given Hanja (excluding `excludeWord`) — Chains edges.
  chainNeighbors(hanja: string, excludeWord?: string): Promise<ChainWord[]>;
  toChainWord(wordKo: string): Promise<ChainWord | undefined>;
  // undefined when there's no stroke data for the character (4 of 1,799).
  strokeOrder(hanja: string): Promise<StrokeOrder | undefined>;
}
