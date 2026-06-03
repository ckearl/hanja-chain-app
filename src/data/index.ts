// The single data entry point screens import. Today it's the mock; when the
// pipeline finishes we swap this binding to the SQLite source — no screen edits.
import { mockSource } from './mock';
import { type DataSource } from './types';

export const data: DataSource = mockSource;
export { decompose } from './mock';
export * from './types';
