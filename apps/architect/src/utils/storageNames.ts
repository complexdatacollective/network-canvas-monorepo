// Every browser-storage name Architect 9 owns, in one place.
//
// Architect 8 is served from the same origin at `/v8/`, so anything this app
// stores under a name Architect 8 also uses is shared with it: IndexedDB,
// sessionStorage and BroadcastChannel are all per-origin, not per-path. Each
// major therefore keeps its own names, and only reads (never writes) the
// libraries of earlier majors listed in `LEGACY_LIBRARIES`.
//
// Literals, not values derived from `APP_SCHEMA_VERSION`: a schema bump must
// be a deliberate rename, which the test beside this module enforces. Kept
// free of imports so the e2e suite can read the same names by relative path.

/** The Dexie database that holds this app's protocol library. */
export const PROTOCOL_DB_NAME = 'ArchitectProtocolDB-v9';

/**
 * redux-remember's key prefix. Its default, `@@remember-`, is what Architect 8
 * keeps using — and a tab that moves between `/` and `/v8/` shares one
 * sessionStorage, so the same prefix would hand each app the other's session.
 */
export const SESSION_PREFIX = '@@remember-v9-';

/** The channel tabs use to agree which one may edit a protocol. */
export const TAB_LOCK_CHANNEL = 'architect-v9-protocol-lock';

type LegacyLibrary = {
  /** The schema major the library's protocols were written for. */
  schemaMajor: number;
  /** That major's Dexie database. Read-only to this app. */
  dbName: string;
  /** Where that major's Architect is served on this origin. */
  basePath: string;
};

/** The protocol libraries of earlier Architect majors on this origin. */
export const LEGACY_LIBRARIES = [
  { schemaMajor: 8, dbName: 'ArchitectProtocolDB', basePath: '/v8/' },
] as const satisfies readonly LegacyLibrary[];
