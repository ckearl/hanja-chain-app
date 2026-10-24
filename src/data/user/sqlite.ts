// ── SQLite UserStore ────────────────────────────────────────────────────
// A separate, writable DB (user.db) next to the read-only content DB.
// openUserDatabase() runs from the root layout's SQLiteProvider onInit, which
// renders no children until it resolves — so screens never query too early.
// Every method also awaits the ready promise, like the content source.

import { openDatabaseAsync, type SQLiteBindValue, type SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import { computeStreak, localDay, newCard, schedule } from './srs';
import { type Grade, type SrsCard, type UserStore } from './types';

export const USER_DB_NAME = 'user.db';

const HISTORY_KEEP = 200; // view-history rows kept (one per hanja)

// Schema migrations, keyed on PRAGMA user_version: MIGRATIONS[i] takes the
// DB from version i to i + 1. Append only — never edit a shipped entry.
const MIGRATIONS: string[] = [
  `CREATE TABLE saved (
     hanja    TEXT PRIMARY KEY,
     saved_at INTEGER NOT NULL            -- epoch ms
   );
   CREATE TABLE views (                   -- deduped: one row per hanja
     hanja     TEXT PRIMARY KEY,
     viewed_at INTEGER NOT NULL,          -- epoch ms, last view
     count     INTEGER NOT NULL DEFAULT 1
   );
   CREATE INDEX views_recent ON views(viewed_at DESC);
   CREATE TABLE activity_days (
     day     TEXT PRIMARY KEY,            -- local 'yyyy-mm-dd'
     views   INTEGER NOT NULL DEFAULT 0,
     reviews INTEGER NOT NULL DEFAULT 0
   );
   CREATE TABLE srs_cards (               -- kept on unsave so re-saving resumes
     hanja            TEXT PRIMARY KEY,
     due              TEXT NOT NULL,      -- local 'yyyy-mm-dd'
     interval         INTEGER NOT NULL,
     ease             REAL NOT NULL,
     reps             INTEGER NOT NULL,
     lapses           INTEGER NOT NULL,
     last_reviewed_at INTEGER
   );
   CREATE INDEX srs_due ON srs_cards(due);`,
];

let resolveDb!: (db: SQLiteDatabase) => void;
let rejectDb!: (err: unknown) => void;
const dbReady = new Promise<SQLiteDatabase>((resolve, reject) => {
  resolveDb = resolve;
  rejectDb = reject;
});
// Callers still see a failed open; this only stops an unhandled-rejection warning.
dbReady.catch(() => {});

// Idempotent: a provider re-init reuses the first open instead of leaking
// another connection.
let opening: Promise<void> | null = null;
export function openUserDatabase() {
  return (opening ??= openOnce());
}

async function openOnce() {
  try {
    const db = await openDatabaseAsync(USER_DB_NAME);
    // WAL isn't available on web's OPFS VFS; the default journal is fine there.
    if (Platform.OS !== 'web') await db.execAsync('PRAGMA journal_mode = WAL');
    await migrate(db);
    resolveDb(db);
  } catch (err) {
    // Don't take the content screens down with it — user-state calls reject instead.
    console.error('[user.db] failed to open', err);
    rejectDb(err);
  }
}

async function migrate(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  for (let v = row?.user_version ?? 0; v < MIGRATIONS.length; v++) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATIONS[v]);
      await db.execAsync(`PRAGMA user_version = ${v + 1}`);
    });
  }
}

// ── Change notification ─────────────────────────────────────────────────
const listeners = new Set<() => void>();
let version = 0;
function emit() {
  version++;
  listeners.forEach((l) => l());
}

// Writes run one at a time (withTransactionAsync isn't exclusive, and
// exclusive transactions aren't supported on web), then notify listeners.
let queue: Promise<unknown> = Promise.resolve();
function write<T>(task: (db: SQLiteDatabase) => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const db = await dbReady;
    let out!: T;
    await db.withTransactionAsync(async () => {
      out = await task(db);
    });
    return out;
  });
  queue = run.catch(() => {});
  return run.then((out) => {
    emit();
    return out;
  });
}

async function all<T>(sql: string, params: SQLiteBindValue[] = []): Promise<T[]> {
  return (await dbReady).getAllAsync<T>(sql, params);
}
async function first<T>(sql: string, params: SQLiteBindValue[] = []): Promise<T | null> {
  return (await dbReady).getFirstAsync<T>(sql, params);
}

type CardRow = {
  hanja: string;
  due: string;
  interval: number;
  ease: number;
  reps: number;
  lapses: number;
  last_reviewed_at: number | null;
};
const toCard = (r: CardRow): SrsCard => ({
  hanja: r.hanja,
  due: r.due,
  interval: r.interval,
  ease: r.ease,
  reps: r.reps,
  lapses: r.lapses,
  lastReviewedAt: r.last_reviewed_at,
});

function markActive(db: SQLiteDatabase, column: 'views' | 'reviews') {
  return db.runAsync(
    `INSERT INTO activity_days (day, ${column}) VALUES (?, 1)
     ON CONFLICT(day) DO UPDATE SET ${column} = ${column} + 1`,
    [localDay()],
  );
}

// Only cards whose hanja is currently saved are reviewable.
const DUE_WHERE = 'c.hanja IN (SELECT hanja FROM saved) AND c.due <= ?';

async function streak() {
  // Bounded scan: a streak can't be longer than the rows we read.
  const rows = await all<{ day: string }>('SELECT day FROM activity_days ORDER BY day DESC LIMIT 3660');
  return computeStreak(
    rows.map((r) => r.day),
    localDay(),
  );
}

async function dueCount() {
  const row = await first<{ n: number }>(`SELECT count(*) AS n FROM srs_cards c WHERE ${DUE_WHERE}`, [localDay()]);
  return row?.n ?? 0;
}

export const sqliteUserStore: UserStore = {
  async isSaved(hanja) {
    return !!(await first('SELECT 1 FROM saved WHERE hanja = ?', [hanja]));
  },

  toggleSaved(hanja) {
    return write(async (db) => {
      const del = await db.runAsync('DELETE FROM saved WHERE hanja = ?', [hanja]);
      if (del.changes > 0) return false;
      await db.runAsync('INSERT INTO saved (hanja, saved_at) VALUES (?, ?)', [hanja, Date.now()]);
      const c = newCard(hanja, localDay());
      await db.runAsync(
        `INSERT OR IGNORE INTO srs_cards (hanja, due, interval, ease, reps, lapses, last_reviewed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [c.hanja, c.due, c.interval, c.ease, c.reps, c.lapses, c.lastReviewedAt],
      );
      return true;
    });
  },

  async savedHanja() {
    const rows = await all<{ hanja: string }>('SELECT hanja FROM saved ORDER BY saved_at DESC, hanja');
    return rows.map((r) => r.hanja);
  },

  recordView(hanja) {
    return write(async (db) => {
      await db.runAsync(
        `INSERT INTO views (hanja, viewed_at) VALUES (?, ?)
         ON CONFLICT(hanja) DO UPDATE SET viewed_at = excluded.viewed_at, count = count + 1`,
        [hanja, Date.now()],
      );
      await db.runAsync(
        `DELETE FROM views WHERE hanja NOT IN
           (SELECT hanja FROM views ORDER BY viewed_at DESC, rowid DESC LIMIT ${HISTORY_KEEP})`,
      );
      await markActive(db, 'views');
    });
  },

  async recentHanja(limit = 12) {
    const rows = await all<{ hanja: string }>('SELECT hanja FROM views ORDER BY viewed_at DESC, rowid DESC LIMIT ?', [limit]);
    return rows.map((r) => r.hanja);
  },

  streak,

  async stats() {
    const today = localDay();
    const [saved, due, s, day] = await Promise.all([
      first<{ n: number }>('SELECT count(*) AS n FROM saved'),
      dueCount(),
      streak(),
      first<{ reviews: number }>('SELECT reviews FROM activity_days WHERE day = ?', [today]),
    ]);
    return {
      savedCount: saved?.n ?? 0,
      dueCount: due,
      streak: s,
      activeToday: !!day,
      reviewsToday: day?.reviews ?? 0,
    };
  },

  dueCount,

  async dueCards(limit = 20) {
    const rows = await all<CardRow>(
      `SELECT c.* FROM srs_cards c WHERE ${DUE_WHERE} ORDER BY c.due, c.hanja LIMIT ?`,
      [localDay(), limit],
    );
    return rows.map(toCard);
  },

  review(hanja, grade: Grade) {
    return write(async (db) => {
      const row = await db.getFirstAsync<CardRow>('SELECT * FROM srs_cards WHERE hanja = ?', [hanja]);
      const today = localDay();
      const next = schedule(row ? toCard(row) : newCard(hanja, today), grade, today);
      await db.runAsync(
        `INSERT OR REPLACE INTO srs_cards (hanja, due, interval, ease, reps, lapses, last_reviewed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [next.hanja, next.due, next.interval, next.ease, next.reps, next.lapses, next.lastReviewedAt],
      );
      await markActive(db, 'reviews');
      return next;
    });
  },

  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  version: () => version,
};
