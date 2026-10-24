# Handoff — 한자 체인 (Hanja Chain)

_Snapshot: 2026-06-02 evening. Pick up here._

Two projects, one product:

| Project | Path | Role |
|---|---|---|
| **Pipeline** (ETL) | `/Users/toph/projects/hanja-chain-data` | Scrapes/builds `hanja.sqlite` — the content database |
| **App** (this repo) | `/Users/toph/projects/hanja-chain-app` | Expo / React Native learner app |

---

## 1. Where the data pipeline stands

- **Done.** stdict scrape finished (415/415, 2026-06-03) and `hanja.sqlite` is built
  (117 MB: 1,799 chars, 312k compounds). Rebuild steps, if ever needed:
  ```bash
  cd /Users/toph/projects/hanja-chain-data
  python -m pipeline.bucket_and_merge --scope core
  python -m pipeline.build_sqlite     --scope core    # -> hanja.sqlite
  python -m pipeline.validate         --scope core
  ```
- Pipeline details live in that repo's `README.md`, `PLAN.md`, and `data/SOURCES.md`
  (incl. the NFC / variant-glyph and stdict-pagination gotchas).

## 2. Where the app stands

**Built: the Search → Character Detail vertical slice, on real data (on-device SQLite).**

- Run it:
  ```bash
  cd /Users/toph/projects/hanja-chain-app
  npx expo start --clear     # then scan QR in Expo Go, or press w (web)
  ```
- **Expo SDK 58** (RN 0.88, React 19.3) as of 2026-10-23. The store Expo Go build for
  SDK 58 was announced as "within a few weeks" of the 2026-10-21 release — if your
  installed Expo Go rejects the project, update Expo Go or use a dev build.
- Confirmed working on **web** and **Expo Go**. iOS Simulator untested (no simulator
  runtime installed here — install one via Xcode to use `press i`).

### Architecture (important)

- **Screens never touch the DB.** They import the async `DataSource` interface from
  `src/data`, bound in `src/data/index.ts` to `src/data/sqlite.ts`. `mock.ts` stays as a
  fixture.
- **Hybrid plan:** a trimmed DB ships on-device (offline-first); an AWS API for the
  long tail (full 312k compounds, full-text search) and user sync can come later as
  another `DataSource` behind the same interface.
- **Trimmed DB:** `python3 scripts/build-local-db.py` reads the pipeline's `hanja.sqlite`
  **read-only** and writes `assets/db/hanja.db` (~9 MB): all chars + readings, every
  krdict compound (`is_common`), topped up to 12 compounds/char with clean stdict words.
  It also regenerates `src/data/dbVersion.ts` (content hash) — the on-device copy is
  keyed by it, so a rebuilt asset replaces the stale copy. Rerun after any pipeline rebuild.
- `<SQLiteProvider>` in `src/app/_layout.tsx` copies the asset on first launch and hands
  the handle to `sqlite.ts`. Web works too (`metro.config.js` adds `.wasm` + COOP/COEP
  headers; `app.json` sets the same headers for hosting).
- User state (saved chars, SRS, streak) will live in a **separate writable DB**, not in
  the read-only `hanja.sqlite`. (Deferred task.)

### File map

```
src/
  theme/        colors.ts (tokens+accents, dark/ink default)   ThemeProvider.tsx
  data/         types.ts (mirrors schema)  sqlite.ts  hangul.ts  mock.ts  index.ts
  hooks/        useQuery.ts (async)
  components/   ui.tsx  CharacterCard.tsx  Placeholder.tsx
  app/
    _layout.tsx              root Stack + ThemeProvider
    (tabs)/_layout.tsx       Daily · Gallery · Search · Chains
    (tabs)/search.tsx        ✅ built
    (tabs)/{index,gallery,chains}.tsx   placeholders
    character/[hanja].tsx    ✅ built
```

---

## 3. Next steps (suggested order)

1. **Run it and give design feedback** — you said you're not 100% sold on the mock UI.
   React to the real Search/Detail slice; redirect the look before more is built.
2. **Build the remaining tabs** (real data is live):
   - **Daily** — bento home (today's char, streak, flashcards-due, gallery count).
   - **Gallery** — the nested 초성 → 중성 → syllable cumulative filter (jamo logic already
     in `src/data/hangul.ts` via `decompose`).
   - **Chains** — the traversal graph (the novel screen; `data.chainNeighbors()` is ready).
3. **Polish**: bundle a Hanja serif font (Noto Serif KR) instead of the system serif;
   tune spacing to the mock.
4. **Ranking**: compounds tie-break by id after common/English/length (no frequency
   data), so e.g. 휴학 can outrank 학생. krdict's vocab grade (초급/중급/고급) would fix it
   if the pipeline captured it.
5. **User-state DB** (saved chars, SRS, streak, real "recent") — separate writable DB.
6. Old `hanja-<hash>.db` copies aren't deleted when the asset changes (~9 MB each);
   add cleanup before shipping data updates.

## 4. Gotchas to remember

- **Expo Go only supports one SDK at a time** (see §2). Check it before bumping the SDK.
- RN 0.88 widened `ColorValue` (adds `null`/`number`); `@expo/vector-icons` still types
  `color` narrowly — see the cast in `src/app/(tabs)/_layout.tsx`.
- **Xcode license** must stay accepted or `git`/`xcrun`/`simctl` fail with exit 69
  (`sudo xcodebuild -license accept`). Already accepted.
- Only ~7% of all compounds have English (~80% of the trimmed on-device set) — UI must
  treat English as enhancement, Korean as the guarantee.
- The pipeline's `character_compounds.position` is the ordinal among a word's **Hanja**,
  not a string index (붙이기一家 → 一=0). Syllable alignment lives in
  `toChainWord()` in `src/data/hangul.ts`.
- **NFC hazard:** literal CJK compatibility ideographs in source (e.g. U+F900 豈) get
  silently normalized to unified ones — this broke `HANJA_RE` once. Use `\u` escapes.
