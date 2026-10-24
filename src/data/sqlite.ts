// ── SQLite DataSource ───────────────────────────────────────────────────
// Backed by the trimmed on-device DB (assets/db/hanja.db, built by
// scripts/build-local-db.py). <SQLiteProvider> in the root layout copies the
// asset into the app's documents dir and hands the handle to attachDatabase();
// it renders no children until then, so screens never query before it's ready.

import { type SQLiteBindValue, type SQLiteDatabase } from 'expo-sqlite';

import { DB_VERSION } from './dbVersion';
import { decompose, hasLatin, isHanja, toChainWord } from './hangul';
import {
  type CoreLevel,
  type Compound,
  type DataSource,
  type GalleryEntry,
  type GalleryFilter,
  type HanjaChar,
  type SearchMode,
} from './types';

export const DB_NAME = `hanja-${DB_VERSION}.db`;

let resolveDb!: (db: SQLiteDatabase) => void;
const dbReady = new Promise<SQLiteDatabase>((resolve) => (resolveDb = resolve));

export async function attachDatabase(db: SQLiteDatabase) {
  await db.execAsync('PRAGMA query_only = ON'); // content DB is read-only
  resolveDb(db);
}

// ── Rows ────────────────────────────────────────────────────────────────
type CharRow = {
  hanja: string;
  primary_sound: string;
  level: string | null;
  is_core: number;
  core_level: string | null;
  meaning_ko: string | null;
  meaning_en: string | null;
  radical: string | null;
  strokes: number | null;
  total_strokes: number | null;
};
type ReadingRow = { hanja: string; reading: string; meaning_ko: string | null; is_primary: number };
type CompoundRow = {
  id: number;
  word_ko: string;
  word_ko_raw: string | null;
  hanja_form: string;
  pos: string | null;
  definition_ko: string | null;
  definition_en: string | null;
  english_gloss: string | null;
  has_english: number;
};

const placeholders = (n: number) => Array(n).fill('?').join(',');
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

// Common (krdict) words first, then ones with English, then shorter words.
const COMPOUND_ORDER = 'c.is_common DESC, c.has_english DESC, length(c.hanja_form), c.id';

async function all<T>(sql: string, params: SQLiteBindValue[] = []): Promise<T[]> {
  const db = await dbReady;
  return db.getAllAsync<T>(sql, params);
}

// Full HanjaChar objects (with readings) for the given hanja, in input order.
async function loadChars(hanjas: string[]): Promise<HanjaChar[]> {
  const keys = [...new Set(hanjas)];
  if (!keys.length) return [];
  const ph = placeholders(keys.length);
  const [rows, readings] = await Promise.all([
    all<CharRow>(`SELECT * FROM characters WHERE hanja IN (${ph})`, keys),
    all<ReadingRow>(
      `SELECT * FROM character_readings WHERE hanja IN (${ph}) ORDER BY is_primary DESC, reading`,
      keys,
    ),
  ]);
  const byHanja = new Map(rows.map((r) => [r.hanja, r]));
  return keys.flatMap((h) => {
    const r = byHanja.get(h);
    if (!r) return [];
    return [
      {
        hanja: r.hanja,
        primarySound: r.primary_sound,
        meaningKo: r.meaning_ko,
        meaningEn: r.meaning_en,
        level: r.level,
        isCore: !!r.is_core,
        coreLevel: r.core_level as CoreLevel,
        radical: r.radical,
        strokes: r.strokes,
        totalStrokes: r.total_strokes,
        readings: readings
          .filter((x) => x.hanja === h)
          .map((x) => ({ reading: x.reading, meaningKo: x.meaning_ko, isPrimary: !!x.is_primary })),
      },
    ];
  });
}

async function loadCompounds(rows: CompoundRow[]): Promise<Compound[]> {
  if (!rows.length) return [];
  const chars = await all<{ compound_id: number; hanja: string; position: number }>(
    `SELECT compound_id, hanja, position FROM character_compounds
     WHERE compound_id IN (${placeholders(rows.length)}) ORDER BY position`,
    rows.map((r) => r.id),
  );
  return rows.map((r) => ({
    id: r.id,
    wordKo: r.word_ko,
    wordKoRaw: r.word_ko_raw,
    hanjaForm: r.hanja_form,
    pos: r.pos,
    definitionKo: r.definition_ko,
    definitionEn: r.definition_en,
    englishGloss: r.english_gloss,
    hasEnglish: !!r.has_english,
    chars: chars
      .filter((c) => c.compound_id === r.id)
      .map((c) => ({ hanja: c.hanja, position: c.position })),
  }));
}

// Compounds containing `hanja`, ranked. limit -1 = no limit. Single-Hanja
// entries (e.g. 학 = 學 as a noun) are the character itself, not a compound.
function compoundRowsForChar(hanja: string, limit = -1) {
  return all<CompoundRow>(
    `SELECT DISTINCT c.* FROM character_compounds cc JOIN compounds c ON c.id = cc.compound_id
     WHERE cc.hanja = ? AND length(c.hanja_form) > 1 ORDER BY ${COMPOUND_ORDER} LIMIT ?`,
    [hanja, limit],
  );
}

// Placeholder until user state (history, SRS) lands in its own writable DB.
const RECENT_HANJA = ['學', '江', '心', '愛'];

export const sqliteSource: DataSource = {
  async getCharacter(hanja) {
    return (await loadChars([hanja]))[0];
  },

  async compoundsForChar(hanja, limit) {
    return loadCompounds(await compoundRowsForChar(hanja, limit));
  },

  async search(query, mode: SearchMode = 'auto') {
    const q = query.trim();
    if (!q) return [];
    let m = mode;
    if (m === 'auto') m = [...q].some(isHanja) ? 'hanja' : hasLatin(q) ? 'english' : 'korean';

    if (m === 'hanja') return loadChars([...q].filter(isHanja));

    const like = `%${escapeLike(q)}%`;
    if (m === 'english') {
      // Glosses that lead with the query word ('water, liquid') before ones
      // that merely contain it ('hot water').
      const lead = escapeLike(q);
      const rows = await all<{ hanja: string }>(
        `SELECT hanja FROM characters WHERE meaning_en LIKE ? ESCAPE '\\'
         ORDER BY (meaning_en LIKE ? ESCAPE '\\' OR meaning_en LIKE ? ESCAPE '\\'
                   OR meaning_en LIKE ? ESCAPE '\\') DESC, length(meaning_en)
         LIMIT 100`,
        [like, lead, `${lead},%`, `${lead} %`],
      );
      return loadChars(rows.map((r) => r.hanja));
    }

    // korean: match a reading/sound or meaning, or a word (-> its chars)
    const [byReading, words] = await Promise.all([
      all<{ hanja: string }>(
        `SELECT DISTINCT ch.hanja FROM characters ch
         LEFT JOIN character_readings r ON r.hanja = ch.hanja
         WHERE ch.primary_sound = ? OR r.reading = ? OR ch.meaning_ko LIKE ? ESCAPE '\\'
         ORDER BY ch.primary_sound <> ?, ch.hanja LIMIT 100`,
        [q, q, like, q],
      ),
      all<{ hanja: string }>(
        `SELECT cc.hanja FROM compounds c JOIN character_compounds cc ON cc.compound_id = c.id
         WHERE c.id IN (SELECT c.id FROM compounds c WHERE c.word_ko LIKE ? ESCAPE '\\'
                        ORDER BY c.word_ko <> ?, ${COMPOUND_ORDER} LIMIT 10)
         ORDER BY c.word_ko <> ?, cc.position`,
        [`${escapeLike(q)}%`, q, q],
      ),
    ]);
    return loadChars([...byReading, ...words].map((r) => r.hanja));
  },

  async charactersByReading(filter: GalleryFilter) {
    const rows = filter.syllable
      ? await all<{ hanja: string; primary_sound: string }>(
          'SELECT hanja, primary_sound FROM characters WHERE primary_sound = ?',
          [filter.syllable],
        )
      : (await all<{ hanja: string; primary_sound: string }>('SELECT hanja, primary_sound FROM characters')).filter(
          (r) => {
            const { cho, jung } = decompose(r.primary_sound);
            if (filter.cho && cho !== filter.cho) return false;
            if (filter.jung && jung !== filter.jung) return false;
            return true;
          },
        );
    rows.sort((a, b) => a.primary_sound.localeCompare(b.primary_sound, 'ko'));
    return loadChars(rows.map((r) => r.hanja));
  },

  async galleryIndex() {
    // Binary order on Hangul syllables is 가나다 order.
    const rows = await all<{ hanja: string; primary_sound: string; meaning_ko: string | null }>(
      'SELECT hanja, primary_sound, meaning_ko FROM characters ORDER BY primary_sound, hanja',
    );
    return rows.map(
      (r): GalleryEntry => ({ hanja: r.hanja, primarySound: r.primary_sound, meaningKo: r.meaning_ko }),
    );
  },

  async chainNeighbors(hanja, excludeWord) {
    return (await compoundRowsForChar(hanja))
      .filter((c) => c.word_ko !== excludeWord)
      .map((c) => toChainWord(c.word_ko, c.hanja_form));
  },

  async toChainWord(wordKo) {
    const rows = await all<CompoundRow>(
      `SELECT c.* FROM compounds c WHERE c.word_ko = ? ORDER BY ${COMPOUND_ORDER} LIMIT 1`,
      [wordKo],
    );
    return rows[0] && toChainWord(rows[0].word_ko, rows[0].hanja_form);
  },

  async recent() {
    return loadChars(RECENT_HANJA);
  },
};
