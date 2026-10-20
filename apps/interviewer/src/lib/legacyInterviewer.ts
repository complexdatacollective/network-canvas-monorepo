import { LEGACY_LIBRARIES } from './db/storageNames';

// The previous Interviewer major, served beside this app on the same origin.
//
// A build that bundles Interviewer 8 copies it into `dist/v8/` and says so
// through the `__INTERVIEWER_V8__` define; any other build (dev, tests,
// Storybook, a build made before Interviewer 8.5.0 was pinned) has no `/v8/`
// to go to: the SPA fallback would serve this app's own shell there, which has
// no route for it, and the researcher would land on a blank page. So every way
// of handing something to Interviewer 8 asks `getBundledLegacyInterviewer`
// first and is not offered when it answers null.

/** What the build bundled, when it bundled Interviewer 8. */
export type BundledLegacyInterviewer = {
  version: string;
  path: '/v8/';
};

/** The schema major the bundled Interviewer runs (and so its app major). */
export const LEGACY_INTERVIEWER_MAJOR = LEGACY_LIBRARIES[0].schemaMajor;

/**
 * The prefix of every cache the bundled Interviewer keeps
 * (`scripts/buildtime/legacy-app.ts`, `legacyApp('interviewer').cachePrefix`;
 * the bundling step refuses a build that caches under any other). Its
 * precache is named `<prefix><version>-<build>-precache-…`.
 */
export const LEGACY_INTERVIEWER_CACHE_PREFIX = `interviewer-v${LEGACY_INTERVIEWER_MAJOR}-`;

/**
 * The bundled Interviewer 8, or null when this build has none.
 *
 * Read through `typeof` so a build whose config does not define the constant
 * reads it as absent instead of throwing a ReferenceError.
 */
export const getBundledLegacyInterviewer =
  (): BundledLegacyInterviewer | null =>
    typeof __INTERVIEWER_V8__ === 'undefined' ? null : __INTERVIEWER_V8__;

/** `/v8/?start=<hash>`: Interviewer 8 opens its new-interview form. */
export const legacyStartUrl = (
  interviewer: BundledLegacyInterviewer,
  protocolHash: string,
): string => `${interviewer.path}?start=${encodeURIComponent(protocolHash)}`;

/** `/v8/interview/<id>`: Interviewer 8 resumes that interview. */
export const legacyResumeUrl = (
  interviewer: BundledLegacyInterviewer,
  sessionId: string,
): string => `${interviewer.path}interview/${encodeURIComponent(sessionId)}`;

/** `/v8/?import=<key>`: Interviewer 8 imports the file staged under `key`. */
export const legacyImportUrl = (
  interviewer: BundledLegacyInterviewer,
  handoffKey: string,
): string => `${interviewer.path}?import=${encodeURIComponent(handoffKey)}`;

/** `/v8/data`: Interviewer 8's data view, where its interviews are exported. */
export const legacyDataUrl = (interviewer: BundledLegacyInterviewer): string =>
  `${interviewer.path}data`;

/**
 * Leave this app for Interviewer 8. A full page load, never router
 * navigation: this app's router has no route under `/v8/`, so only the server
 * can serve Interviewer 8 there.
 */
export const goToLegacyInterviewer = (url: string): void => {
  window.location.assign(url);
};
