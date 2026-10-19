// Every IndexedDB name Interviewer 9 owns or reads, in one place.
//
// Interviewer 8 is served from the same origin at `/v8/`, and IndexedDB is
// per-origin, not per-path: anything this app stored under a name Interviewer
// 8 also uses would be shared with it. Each major therefore keeps its own
// database, and this app only reads (never writes, beyond the lock maintenance
// in `legacyVaultMaintenance`) the databases of earlier majors listed in
// `LEGACY_LIBRARIES`.
//
// Literals, not values derived from the schema version at runtime: a schema
// bump must be a deliberate rename, which the test beside this module enforces
// against the schema version the embedded interview engine runs. Kept free of
// imports so the e2e suite can read the same names by relative path.

/** The Dexie database that holds this app's protocols, interviews and settings. */
export const DB_NAME = 'interviewer-v9';

type LegacyLibrary = {
  /** The schema major the library's protocols were written for. */
  schemaMajor: number;
  /** That major's Dexie database. Read-only to this app. */
  dbName: string;
  /** Where that major's Interviewer is served on this origin. */
  basePath: string;
};

/** The databases of earlier Interviewer majors on this origin. */
export const LEGACY_LIBRARIES = [
  { schemaMajor: 8, dbName: 'interviewer', basePath: '/v8/' },
] as const satisfies readonly LegacyLibrary[];
