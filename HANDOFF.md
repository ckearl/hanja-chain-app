# Handoff — 한자 체인 (Hanja Chain)

_Snapshot: 2026-06-02 evening. Pick up here._

Two projects, one product:

| Project | Path | Role |
|---|---|---|
| **Pipeline** (ETL) | `/Users/toph/projects/hanja-app` | Scrapes/builds `hanja.sqlite` — the content database |
| **App** (this repo) | `/Users/toph/projects/hanja-chain-app` | Expo / React Native learner app |

---

## 1. Where the data pipeline stands

- The **stdict scrape was ~49% done** (203 / 415 syllables) and **still running** in a
  terminal/tmux as of this snapshot. It's resume-safe — if it stopped, just rerun:
  ```bash
  cd /Users/toph/projects/hanja-app
  caffeinate -is python -m pipeline.scrape_stdict --scope core 2>&1 | tee -a scrape.log
  ```
  Done syllables are skipped; cached pages are reused.
- **krdict is fully done** (every syllable, capped at 100 results each — accepted limit).
- **When the scrape finishes**, build the real DB:
  ```bash
  cd /Users/toph/projects/hanja-app
  python -m pipeline.bucket_and_merge --scope core
  python -m pipeline.build_sqlite     --scope core    # -> hanja.sqlite
  python -m pipeline.validate         --scope core
  ```
- Pipeline details live in that repo's `README.md`, `PLAN.md`, and `data/SOURCES.md`
  (incl. the NFC / variant-glyph and stdict-pagination gotchas).

## 2. Where the app stands

**Built: the Search → Character Detail vertical slice, on a mock data layer.**

- Run it:
  ```bash
  cd /Users/toph/projects/hanja-chain-app
  npx expo start --clear     # then scan QR in Expo Go, or press w (web)
  ```
- **Expo SDK is pinned to 54** on purpose — the App Store Expo Go was lagging behind the
  just-released SDK 55/56 and rejected them. Don't bump the SDK unless you've confirmed
  Expo Go supports it (or you switch to a dev build, which has no such limit).
- Confirmed working on **web** and **Expo Go**. iOS Simulator untested (no simulator
  runtime installed here — install one via Xcode to use `press i`).

### Architecture (important)

- **Screens never touch the DB.** They import the async `DataSource` interface from
  `src/data`. Today it's backed by `src/data/mock.ts` (the design's real Korean data).
- **The SQLite swap is one line.** When `hanja.sqlite` is ready, write a
  `src/data/sqlite.ts` implementing the same `DataSource` interface and change the binding
  in `src/data/index.ts`. No screen changes.
- User state (saved chars, SRS, streak) will live in a **separate writable DB**, not in
  the read-only `hanja.sqlite`. (Deferred task.)

### File map

```
src/
  theme/        colors.ts (tokens+accents, dark/ink default)   ThemeProvider.tsx
  data/         types.ts (mirrors schema)  mock.ts  index.ts  ← SQLite swaps in here
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
2. **Build the remaining tabs** on the mock layer:
   - **Daily** — bento home (today's char, streak, flashcards-due, gallery count).
   - **Gallery** — the nested 초성 → 중성 → syllable cumulative filter (jamo logic already
     in `src/data/mock.ts` via `decompose`).
   - **Chains** — the traversal graph (the novel screen; `data.chainNeighbors()` is ready).
3. **Polish**: bundle a Hanja serif font (Noto Serif KR) instead of the system serif;
   tune spacing to the mock.
4. **When the pipeline finishes**: build `hanja.sqlite`, then wire `src/data/sqlite.ts`
   (expo-sqlite, open bundled asset → copy to documents on first launch) and flip
   `src/data/index.ts`. (Task #8 in the pipeline's task list.)

## 4. Gotchas to remember

- **Don't bump Expo SDK** past what Expo Go supports (see §2). SDK 54 is the safe floor.
- **Xcode license** must stay accepted or `git`/`xcrun`/`simctl` fail with exit 69
  (`sudo xcodebuild -license accept`). Already accepted.
- Only ~50% of compounds will have English (krdict's cap) — UI must treat English as
  enhancement, Korean as the guarantee.
