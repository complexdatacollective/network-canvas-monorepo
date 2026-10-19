import { LEGACY_LIBRARIES } from './storageNames';

// The previous Architect major, served beside this app on the same origin.
//
// A build that bundles Architect 8 copies it into `dist/v8/` and says so
// through the `__ARCHITECT_V8__` define; any other build (dev, tests, a build
// made before Architect 8.5.0 was pinned) has no `/v8/` to go to — the SPA
// fallback would serve this app's own shell there, which has no route for it,
// and the researcher would land on a blank page. So every way of handing a
// protocol to Architect 8 asks `getBundledLegacyArchitect` first and is not
// offered when it answers null.

/** What the build bundled, when it bundled Architect 8. */
export type BundledLegacyArchitect = {
  version: string;
  path: '/v8/';
};

/** The schema major the bundled Architect edits (and so its app major). */
export const LEGACY_ARCHITECT_MAJOR = LEGACY_LIBRARIES[0].schemaMajor;

/**
 * The bundled Architect 8, or null when this build has none.
 *
 * Read through `typeof` so a build whose config does not define the constant
 * (yet) reads it as absent instead of throwing a ReferenceError.
 */
export const getBundledLegacyArchitect = (): BundledLegacyArchitect | null =>
  typeof __ARCHITECT_V8__ === 'undefined' ? null : __ARCHITECT_V8__;

/** `/v8/?open=<id>`: Architect 8 opens that protocol from its own library. */
export const legacyOpenUrl = (
  architect: BundledLegacyArchitect,
  legacyProtocolId: string,
): string => `${architect.path}?open=${encodeURIComponent(legacyProtocolId)}`;

/** `/v8/?import=<key>`: Architect 8 imports the file staged under `key`. */
export const legacyImportUrl = (
  architect: BundledLegacyArchitect,
  handoffKey: string,
): string => `${architect.path}?import=${encodeURIComponent(handoffKey)}`;

/**
 * Leave this app for the other one. A full page load, never router navigation:
 * this app's router has no route under `/v8/`, so only the server can serve
 * Architect 8 there.
 */
export const goToLegacyArchitect = (url: string): void => {
  window.location.assign(url);
};
