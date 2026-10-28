// The previous Interviewer major, served beside this app on the same origin.
//
// A build that bundles Interviewer 8 copies it into `dist/v8/` (the dev server
// serves the same pinned build) and says so through the `__INTERVIEWER_V8__`
// define; anything else (tests, Storybook, a dev server that could not obtain
// it, a build made before Interviewer 8.5.0 was pinned) has no `/v8/`
// to go to: the SPA fallback would serve this app's own shell there, which has
// no route for it, and the frame would show a blank page. So the interview
// route asks `getBundledLegacyInterviewer` before it hosts a schema 8
// interview there, and explains instead when it answers null.
//
// Interviewer 8 is used for exactly one thing: running a schema 8 interview,
// so that its participants see the interview they always have. This app hosts
// it in a same-origin frame (components/Interviewer8Frame.tsx) and hands it
// the unlock; both apps read and write the same `interviewer` database.

/** What the build bundled, when it bundled Interviewer 8. */
export type BundledLegacyInterviewer = {
  version: string;
  path: '/v8/';
};

/** The schema major the bundled Interviewer runs (and so its app major). */
export const LEGACY_INTERVIEWER_MAJOR = 8;

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

/**
 * `/v8/interview/<id><search>`: Interviewer 8's interview route, the only one
 * it renders, and the address of the frame that hosts it. `search` is passed
 * through unchanged (`?mode=review` for review).
 */
export const legacyInterviewUrl = (
  interviewer: BundledLegacyInterviewer,
  sessionId: string,
  search: string,
): string =>
  `${interviewer.path}interview/${encodeURIComponent(sessionId)}${search}`;
