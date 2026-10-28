# Handoff — 한자 체인 (Hanja Chain)

_Snapshot: 2026-10-24 (after the overnight feature run on `overnight/features`). Pick up here._

Two projects, one product:

| Project | Path | Role |
|---|---|---|
| **Pipeline** (ETL) | `../hanja-chain-data` ([github](https://github.com/ckearl/hanja-chain-data)) | Scrapes/builds `hanja.sqlite` — the content database |
| **App** (this repo) | `.` ([github](https://github.com/ckearl/hanja-chain-app)) | Expo / React Native learner app |

---

## 1. Where the data pipeline stands

- **Done.** stdict scrape finished (415/415, 2026-06-03) and `hanja.sqlite` is built
  (117 MB: 1,799 chars, 312k compounds). Rebuild steps, if ever needed:
  ```bash
  cd ../hanja-chain-data
  python -m pipeline.bucket_and_merge --scope core
  python -m pipeline.build_sqlite     --scope core    # -> hanja.sqlite
  python -m pipeline.validate         --scope core
  ```
- Pipeline details live in that repo's `README.md`, `PLAN.md`, and `data/SOURCES.md`
  (incl. the NFC / variant-glyph and stdict-pagination gotchas).

## 2. Where the app stands

**Built: all four tabs + Detail + flashcard review, on real data (on-device SQLite).**
Merged to `main` 2026-10-25 (not pushed).

- Run it:
  ```bash
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
  krdict compound (`is_common`), topped up to 12 compounds/char with clean stdict words,
  plus `stroke_orders` (1,795 chars; animCJK Korean → Trad. Chinese → Japanese → Make Me
  a Hanzi, preferring a source whose stroke count matches `total_strokes`; Arphic PL,
  see `assets/db/STROKES-LICENSE.txt`). Sources download once into `scripts/.cache/`.
  It also regenerates `src/data/dbVersion.ts` (content hash) — the on-device copy is
  keyed by it, so a rebuilt asset replaces the stale copy. Rerun after any pipeline rebuild.
- `<SQLiteProvider>` in `src/app/_layout.tsx` copies the asset on first launch and hands
  the handle to `sqlite.ts`. Web works too (`metro.config.js` adds `.wasm` + COOP/COEP
  headers; `app.json` sets the same headers for hosting).
- **User state** lives in a separate writable `user.db` behind the `UserStore` interface
  (`src/data/user/`): saved chars, view history, activity days → streak, classic SM-2
  cards (grades 0–5, `srs.ts`). Migrations on `PRAGMA user_version`; writes go through a
  serial queue (no exclusive transactions on web). `useUserQuery` re-runs on store
  changes so saves update every screen live. Opened by `initDatabases` (the provider's
  `onInit`); a user.db failure only breaks user-state calls.
- **Font:** subset Noto Serif CJK KR in `assets/fonts/` (Regular 3 MB for `<Hanja>`,
  Bold 0.75 MB for titles, no Hanja in Bold), loaded with `useFonts`. Rebuild with
  `scripts/build-font-subset.py` (see its docstring) whenever the DB gains new characters.

### File map

```
src/
  theme/        colors.ts (tokens+accents, dark/ink default)   ThemeProvider.tsx
  theme/        fonts.ts (subset serif + fallbacks)
  data/         types.ts (mirrors schema)  sqlite.ts  hangul.ts  mock.ts  index.ts
  data/user/    types.ts  sqlite.ts (user.db)  srs.ts (SM-2 + date math)
  hooks/        useQuery.ts (async)  useUserQuery.ts (re-runs on user-state changes)
  components/   ui.tsx  CharacterCard.tsx
  components/strokes/  StrokePractice.tsx (spin-in card, demo, tracing)
                       StrokeCanvas.tsx (svg)  geometry.ts (stroke matching)
  app/
    _layout.tsx              root Stack, fonts, SQLiteProvider, ThemeProvider
    (tabs)/_layout.tsx       Daily · Gallery · Search · Chains (headerShown: false)
    (tabs)/index.tsx         Daily bento (today's char, gallery, streak, flashcards…)
    (tabs)/gallery.tsx       초성 → 중성 → syllable browser, 전체/저장 toggle
    (tabs)/search.tsx        search + recently viewed (from history)
    (tabs)/chains.tsx        word → Hanja → word tree (?word= / ?hanja= params)
    character/[hanja].tsx    detail + save toggle; tap the hero glyph → stroke practice
    review.tsx               SM-2 flashcard session
```

---

## 3. Next steps (suggested order)

1. **Run it and give design feedback** on the whole app (`npx expo start`, press `w`).
2. **Test on a device/simulator.** Everything was verified on web only; Expo Go for
   SDK 58 may not be in the stores yet (see above).
3. **Ranking**: compounds tie-break by id after common/English/length (no frequency
   data), so e.g. 學's top words are 휴학/광학 rather than 학교/학생 — visible on Daily,
   Detail, Chains and flashcard backs. krdict's vocab grade (초급/중급/고급) would fix it
   if the pipeline captured it.
4. **Open TODOs in code:** `TODO(etymology)` (Daily's 글자 풀이 pane uses radical/strokes
   since the DB has no etymology); Chains `?word=學校` (multi-Hanja) opens only 學.
5. Old `hanja-<hash>.db` copies aren't deleted when the asset changes (~9 MB each);
   add cleanup before shipping data updates.
6. Smaller polish: Chains tree scrolls sideways past ~7 hops; Gallery labels truncate
   long meanings at 4 columns; new SRS cards show "내일" on every grade button (correct
   SM-2 for a first review, but looks redundant); full 11,172-syllable Hangul font
   coverage is one flag away (`--all-hangul`, +2 MB/weight).

7. Stroke order: no data for 屛 戱 玆 畓 (button hidden). 81 chars' stroke data
   disagrees with the dictionary's `total_strokes` (glyph conventions, e.g. 成 6 vs 7);
   practice uses the data's own count. Practice results aren't saved yet (could feed SRS).

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
