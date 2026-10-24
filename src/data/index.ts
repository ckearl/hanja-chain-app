// The single data entry point screens import. Bound to the on-device SQLite
// source; mock.ts stays as a fixture. An API-backed source for the long tail
// can slot in behind the same interface — no screen edits.
import { sqliteSource } from './sqlite';
import { type DataSource } from './types';

export const data: DataSource = sqliteSource;
export { attachDatabase, DB_NAME } from './sqlite';
export { decompose } from './hangul';
export * from './types';
