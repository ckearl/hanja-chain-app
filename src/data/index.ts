// The single data entry point screens import. Bound to the on-device SQLite
// source; mock.ts stays as a fixture. An API-backed source for the long tail
// can slot in behind the same interface — no screen edits.
import { type SQLiteDatabase } from 'expo-sqlite';

import { attachDatabase, sqliteSource } from './sqlite';
import { type DataSource } from './types';
import { openUserDatabase, sqliteUserStore } from './user/sqlite';
import { type UserStore } from './user/types';

export const data: DataSource = sqliteSource;
// Per-user state (saved, history, streak, SRS) in its own writable DB.
export const user: UserStore = sqliteUserStore;

// SQLiteProvider onInit: attach the content DB and open the user DB together.
export async function initDatabases(db: SQLiteDatabase) {
  await Promise.all([attachDatabase(db), openUserDatabase()]);
}

export { DB_NAME } from './sqlite';
export { decompose, isHanja } from './hangul';
// Pure SM-2 scheduler, for previewing a grade's next interval without writing.
export { schedule as previewSchedule } from './user/srs';
export * from './types';
export * from './user/types';
