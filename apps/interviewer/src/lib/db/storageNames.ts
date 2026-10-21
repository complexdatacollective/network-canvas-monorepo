// The IndexedDB database Interviewer keeps its protocols, interviews and
// settings in.
//
// ONE DATABASE FOR BOTH MAJORS. Interviewer 8 is served from the same origin
// at `/v8/` and has always used this name, so a device updated from 8.x keeps
// its protocols and interviews in place. Interviewer 9 owns the database: it
// declares the versions above Interviewer 8's and runs any upgrade (see
// `db.ts`), and writes the rows of schema 8 protocols in Interviewer 8's own
// format. Interviewer 8 at `/v8/` only writes the session row of the interview
// it is running.
//
// Kept free of imports so the e2e suite and the release walkers can read the
// same name by relative path.

/** The Dexie database that holds every protocol, interview and setting. */
export const DB_NAME = 'interviewer';

/**
 * Databases only an unreleased Interviewer 9 build (#2299) created on this
 * origin: its own database, before it moved into Interviewer 8's, and the
 * store it staged hand-offs to Interviewer 8 in. Nothing reads them; they are
 * deleted at start-up and on every reset (`deleteRetiredDatabases`).
 */
export const RETIRED_DB_NAMES = [
  'interviewer-v9',
  'InterviewerHandoffDB',
] as const;
