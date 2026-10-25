#!/usr/bin/env python3
"""Build the subset Noto Serif fonts in assets/fonts/ from the full upstream files.

The full CJK fonts are ~25 MB per weight, so we keep only the glyphs the app can
actually show:
  - every distinct character in any TEXT column of assets/db/hanja.db
  - every non-ASCII character in src/ (hard-coded UI strings)
  - the 2,350 KS X 1001 Hangul syllables (everyday Korean) + compatibility jamo
    (Gallery chips). Every syllable in the DB/src is included either way; the
    full 11,172-syllable block would cost +2 MB per weight (pass --all-hangul).
  - ASCII, Latin-1 punctuation and common CJK / general punctuation

Source fonts: Noto Serif CJK KR (the Korean-default build of the same design that
Google Fonts ships as "Noto Serif KR"; the Google Fonts cut lacks ~20 rarer
Hanja that are in the DB). Download into an empty scratch directory, e.g.
  https://github.com/notofonts/noto-cjk/raw/main/Serif/OTF/Korean/NotoSerifCJKkr-Regular.otf
  https://github.com/notofonts/noto-cjk/raw/main/Serif/OTF/Korean/NotoSerifCJKkr-Bold.otf

Dependency: fontTools (pip install fonttools), ideally in a venv:
  python3 -m venv .venv-fonts && .venv-fonts/bin/pip install fonttools
  .venv-fonts/bin/python scripts/build-font-subset.py \
      --regular /path/NotoSerifCJKkr-Regular.otf --bold /path/NotoSerifCJKkr-Bold.otf

Weights: Regular is used by <Hanja> (all glyphs); Bold is used by the Korean
title style, so it only gets Hangul + Latin + punctuation (no Hanja) to keep the
bundle small.
"""

import argparse
import os
import re
import sqlite3
import sys

try:
    from fontTools import subset
    from fontTools.ttLib import TTFont
except ImportError:
    sys.exit('fontTools is required: pip install fonttools (see the docstring)')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, 'assets', 'db', 'hanja.db')
SRC = os.path.join(ROOT, 'src')
OUT = os.path.join(ROOT, 'assets', 'fonts')

ALL_HANGUL = set(range(0xAC00, 0xD7A4))       # 가..힣


def _ksx1001(u: int) -> bool:
    # Python's euc_kr also encodes other syllables as 8-byte jamo sequences;
    # only the 2-byte ones are in the KS X 1001 table.
    try:
        return len(chr(u).encode('euc_kr')) == 2
    except UnicodeEncodeError:
        return False


KSX_HANGUL = {u for u in ALL_HANGUL if _ksx1001(u)}
JAMO = set(range(0x3131, 0x318F))              # ㄱ..ㆎ (compatibility jamo)
ASCII = set(range(0x20, 0x7F))
LATIN1 = set(range(0xA0, 0x100))
EXTRA = set(map(ord, '·•…‥—–‘’“”「」『』《》〈〉【】〔〕、。・←→↑↓↔※〜～！？（），．：；'))
EXTRA |= set(range(0x2000, 0x2070))            # general punctuation
EXTRA |= set(range(0x3000, 0x3020))            # CJK symbols & punctuation


def db_chars() -> set[int]:
    con = sqlite3.connect(f'file:{DB}?mode=ro', uri=True)
    out: set[int] = set()
    tables = [r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")]
    for t in tables:
        cols = [r[1] for r in con.execute(f'PRAGMA table_info({t})') if r[2].upper() == 'TEXT']
        for c in cols:
            for (v,) in con.execute(f'SELECT {c} FROM {t}'):
                if isinstance(v, str):
                    out.update(map(ord, v))
    con.close()
    return out


def src_chars() -> set[int]:
    out: set[int] = set()
    for dirpath, _, files in os.walk(SRC):
        for f in files:
            if f.endswith(('.ts', '.tsx')):
                with open(os.path.join(dirpath, f), encoding='utf-8') as fh:
                    text = fh.read()
                out.update(ord(ch) for ch in text if ord(ch) > 0x7F)
                # \uXXXX escapes (compatibility ideographs are written escaped).
                out.update(int(h, 16) for h in re.findall(r'\\u([0-9A-Fa-f]{4})', text))
    return out


def build(src: str, dest: str, wanted: set[int]) -> None:
    font = TTFont(src)
    cmap = font.getBestCmap()
    have = {u for u in wanted if u in cmap}
    opts = subset.Options()
    opts.hinting = False
    opts.notdef_outline = True
    opts.name_languages = ['*']
    # No vertical text in the app.
    opts.drop_tables += ['vhea', 'vmtx', 'VORG']
    s = subset.Subsetter(opts)
    s.populate(unicodes=have)
    s.subset(font)
    font.save(dest)
    print(f'{os.path.relpath(dest, ROOT)}: {len(have)} chars, {os.path.getsize(dest) / 1e6:.2f} MB')


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--regular', required=True, help='full NotoSerifCJKkr-Regular.otf')
    ap.add_argument('--bold', required=True, help='full NotoSerifCJKkr-Bold.otf')
    ap.add_argument('--all-hangul', action='store_true', help='include all 11,172 syllables')
    args = ap.parse_args()

    content = db_chars() | src_chars()
    base = (ALL_HANGUL if args.all_hangul else KSX_HANGUL) | JAMO | ASCII | LATIN1 | EXTRA
    regular = base | content
    # Titles are Korean; any Hanja in them falls back per glyph.
    bold = base | {u for u in content if u < 0x2E80 or 0xAC00 <= u <= 0xD7A3}

    cmap = TTFont(args.regular).getBestCmap()
    missing = sorted(u for u in db_chars() if u not in cmap and u >= 0x80 and u != 0x200B)
    if missing:
        print('not in source font (system fallback):', ' '.join(f'U+{u:04X}' for u in missing))

    os.makedirs(OUT, exist_ok=True)
    build(args.regular, os.path.join(OUT, 'NotoSerifKR-Regular.otf'), regular)
    build(args.bold, os.path.join(OUT, 'NotoSerifKR-Bold.otf'), bold)


if __name__ == '__main__':
    main()
