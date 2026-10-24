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
  recent(): Promise<HanjaChar[]>;
}
