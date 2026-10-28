#!/usr/bin/env python3
"""Build the trimmed on-device DB (assets/db/hanja.db) from the pipeline's hanja.sqlite.

The source is opened read-only; hanja-chain-data is never modified.

Keeps every character + reading, every krdict compound (the learner's
dictionary = common words), and tops each character up to TARGET_PER_CHAR
compounds with clean stdict-only words (pure Hanja, 2-4 chars, no 『domain』 tag).

Also adds stroke-order data (SVG outline + median per stroke, 1024-unit box) from
animCJK (Korean set first, then Traditional Chinese, Japanese) and Make Me a Hanzi,
downloaded at pinned commits into scripts/.cache/. Both are Arphic Public License;
see assets/db/STROKES-LICENSE.txt.

Usage: python3 scripts/build-local-db.py [path/to/hanja.sqlite]
"""

import hashlib
import json
import os
import sqlite3
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(ROOT), 'hanja-chain-data', 'hanja.sqlite')
OUT = os.path.join(ROOT, 'assets', 'db', 'hanja.db')
VERSION_TS = os.path.join(ROOT, 'src', 'data', 'dbVersion.ts')

TARGET_PER_CHAR = 12

CACHE = os.path.join(ROOT, 'scripts', '.cache')
ANIMCJK = 'https://raw.githubusercontent.com/parsimonhi/animCJK/3e1253b341cc7be14c3540bb3c045e6163557777'
MMAH = 'https://raw.githubusercontent.com/skishore/makemeahanzi/bddc96d41bef78427ed0e034e9f7e31d71fd1b92'
# First source with a character wins. Korean stroke order where animCJK has it;
# Traditional Chinese and Japanese orders agree with it for nearly all Hanja.
STROKE_SOURCES = [
    ('animcjk-ko', f'{ANIMCJK}/graphicsKo.txt'),
    ('animcjk-zh-hant', f'{ANIMCJK}/graphicsZhHant.txt'),
    ('animcjk-ja', f'{ANIMCJK}/graphicsJa.txt'),
    ('makemeahanzi', f'{MMAH}/graphics.txt'),
]

SCHEMA = """
CREATE TABLE characters (
  hanja         TEXT PRIMARY KEY,
  primary_sound TEXT,
  level         TEXT,
  is_core       INTEGER NOT NULL DEFAULT 0,
  core_level    TEXT,
  meaning_ko    TEXT,
  meaning_en    TEXT,
  radical       TEXT,
  strokes       INTEGER,
  total_strokes INTEGER
);
CREATE TABLE character_readings (
  hanja      TEXT NOT NULL REFERENCES characters(hanja),
  reading    TEXT NOT NULL,
  meaning_ko TEXT,
  is_primary INTEGER NOT NULL,
  PRIMARY KEY (hanja, reading)
);
CREATE TABLE compounds (
  id            INTEGER PRIMARY KEY,
  word_ko       TEXT NOT NULL,
  word_ko_raw   TEXT,
  hanja_form    TEXT NOT NULL,
  pos           TEXT,
  definition_ko TEXT,
  definition_en TEXT,
  english_gloss TEXT,
  has_english   INTEGER NOT NULL DEFAULT 0,
  is_common     INTEGER NOT NULL DEFAULT 0  -- in krdict (learner's dictionary)
);
CREATE TABLE character_compounds (
  hanja       TEXT NOT NULL REFERENCES characters(hanja),
  compound_id INTEGER NOT NULL REFERENCES compounds(id),
  position    INTEGER NOT NULL,  -- ordinal among the compound's Hanja, not a string index
  PRIMARY KEY (hanja, compound_id, position)
);
CREATE TABLE stroke_orders (
  hanja   TEXT PRIMARY KEY REFERENCES characters(hanja),
  source  TEXT NOT NULL,
  strokes TEXT NOT NULL,  -- JSON array of SVG outline paths, in stroke order
  medians TEXT NOT NULL   -- JSON array of [x, y] polylines, one per stroke
);
"""

INDEXES = """
CREATE INDEX idx_readings_reading ON character_readings(reading);
CREATE INDEX idx_compounds_word ON compounds(word_ko);
CREATE INDEX idx_cc_hanja ON character_compounds(hanja);
CREATE INDEX idx_cc_compound ON character_compounds(compound_id);
"""

# Clean stdict-only filler candidates, ranked per character.
FILLER = """
WITH common_counts AS (
  SELECT cc.hanja, COUNT(*) AS n
  FROM src.character_compounds cc JOIN src.compounds c ON c.id = cc.compound_id
  WHERE c.krdict_target_code IS NOT NULL
  GROUP BY cc.hanja
),
candidates AS (
  SELECT cc.hanja, c.id,
         ROW_NUMBER() OVER (
           PARTITION BY cc.hanja
           ORDER BY length(c.hanja_form), c.pos = '명사' DESC, c.id
         ) AS rn
  FROM src.character_compounds cc JOIN src.compounds c ON c.id = cc.compound_id
  WHERE c.krdict_target_code IS NULL
    AND length(c.hanja_form) BETWEEN 2 AND 4
    AND c.hanja_form NOT GLOB '*[가-힣]*'
    AND coalesce(c.definition_ko, '') NOT LIKE '『%'
)
SELECT DISTINCT cand.id
FROM candidates cand LEFT JOIN common_counts k ON k.hanja = cand.hanja
WHERE cand.rn <= ? - coalesce(k.n, 0)
"""


def load_stroke_sources() -> list[tuple[str, dict]]:
    """Each source as (name, {char: graphics record}), downloading once into CACHE."""
    os.makedirs(CACHE, exist_ok=True)
    out = []
    for name, url in STROKE_SOURCES:
        path = os.path.join(CACHE, f'{name}.txt')
        if not os.path.exists(path):
            print(f'downloading {url}')
            urllib.request.urlretrieve(url, path)
        with open(path, encoding='utf-8') as f:
            records = (json.loads(line) for line in f if line.strip())
            out.append((name, {r['character']: r for r in records}))
    return out


def insert_stroke_orders(db: sqlite3.Connection) -> None:
    sources = load_stroke_sources()
    rows, mismatched = [], []
    for hanja, total in db.execute('SELECT hanja, total_strokes FROM characters'):
        found = [(name, records[hanja]) for name, records in sources if hanja in records]
        if not found:
            continue
        # Glyph conventions differ (Japanese 侮 has 8 strokes, Korean 9), so prefer
        # the first source that agrees with the dictionary's stroke count.
        name, r = next(((n, r) for n, r in found if len(r['strokes']) == total), found[0])
        rows.append((hanja, name, json.dumps(r['strokes'], separators=(',', ':')),
                     json.dumps(r['medians'], separators=(',', ':'))))
        if total is not None and total != len(r['strokes']):
            mismatched.append(f'{hanja}({name}:{len(r["strokes"])}≠{total})')
    db.executemany('INSERT INTO stroke_orders VALUES (?, ?, ?, ?)', rows)
    if mismatched:
        print(f'  stroke count differs from total_strokes for {len(mismatched)}: {" ".join(mismatched[:20])}')


def main() -> None:
    if not os.path.exists(SRC):
        sys.exit(f'source DB not found: {SRC}')
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    if os.path.exists(OUT):
        os.remove(OUT)

    db = sqlite3.connect(f'file:{OUT}', uri=True)  # uri=True so the ATTACH below honours mode=ro
    db.execute('ATTACH DATABASE ? AS src', (f'file:{SRC}?mode=ro',))
    db.executescript(SCHEMA)

    db.execute("""
      INSERT INTO characters
      SELECT hanja, primary_sound, level, is_core, core_level, meaning_ko, meaning_en,
             radical, strokes, total_strokes
      FROM src.characters""")
    db.execute('INSERT INTO character_readings SELECT * FROM src.character_readings')

    db.execute('CREATE TEMP TABLE keep (id INTEGER PRIMARY KEY)')
    db.execute('INSERT INTO keep SELECT id FROM src.compounds WHERE krdict_target_code IS NOT NULL')
    db.execute(f'INSERT OR IGNORE INTO keep {FILLER}', (TARGET_PER_CHAR,))

    db.execute("""
      INSERT INTO compounds
      SELECT c.id, c.word_ko, c.word_ko_raw, c.hanja_form, c.pos, c.definition_ko,
             c.definition_en, c.english_gloss, c.has_english,
             c.krdict_target_code IS NOT NULL
      FROM src.compounds c JOIN keep k ON k.id = c.id""")
    db.execute("""
      INSERT INTO character_compounds
      SELECT cc.* FROM src.character_compounds cc JOIN keep k ON k.id = cc.compound_id""")

    insert_stroke_orders(db)

    db.executescript(INDEXES)
    db.commit()
    db.execute('DETACH DATABASE src')
    db.execute('VACUUM')

    counts = {t: db.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0]
              for t in ('characters', 'character_readings', 'compounds', 'character_compounds',
                        'stroke_orders')}
    db.close()

    # The app copies the asset into its documents dir once per DB name, so a
    # content hash in the name makes a rebuilt DB replace the stale copy.
    with open(OUT, 'rb') as f:
        digest = hashlib.sha256(f.read()).hexdigest()[:12]
    with open(VERSION_TS, 'w') as f:
        f.write('// Generated by scripts/build-local-db.py — do not edit.\n')
        f.write(f"export const DB_VERSION = '{digest}';\n")

    print(f'wrote {OUT} ({os.path.getsize(OUT) / 1e6:.1f} MB, version {digest})')
    for t, n in counts.items():
        print(f'  {t}: {n:,}')


if __name__ == '__main__':
    main()
