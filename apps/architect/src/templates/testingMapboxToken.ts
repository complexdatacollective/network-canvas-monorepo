// Shared Mapbox public token embedded in templates that use the Geospatial
// interface (currently `transnational-networks`) so the map renders out of the
// box, and carried by the e2e protocol fixtures so Architect's timeline
// warning (`TestingMapboxTokenAlert`, driven by `getUsesTestingMapboxToken` in
// `selectors/issues.ts`) has something to detect in those runs. It is a
// sandbox token: URL-restricted to networkcanvas.com, networkcanvas.dev and
// localhost, and scoped to styles:tiles, styles:read and fonts:read only. It
// will not render maps on any other domain — including Fresco interview
// pages, which live on the researcher's own host — and it is for evaluation
// only: researchers must add their own Mapbox token before fielding a study.
//
// This literal MUST stay identical to the `value` of the token asset in the
// templates' `assetManifest`; `__tests__/testing-token.test.ts` guards drift.
// It is also the ONLY Mapbox token allowed anywhere in the repository:
// `__tests__/mapbox-public-tokens.test.ts` scans every tracked file and every
// text entry inside every tracked archive and fails on any other.
export const TESTING_MAPBOX_TOKEN =
  'pk.eyJ1IjoibmV0d29ya2NhbnZhcyIsImEiOiJjbXRqdnd4dnowY2M5MnlzZWNqYjNlZG5rIn0.KH3OS_O2Hk6gAbDjKGPAJg';

/**
 * The stable id of a Mapbox access token, or null when `value` is not shaped
 * like one. Tokens are `<prefix>.<base64url JSON>.<signature>`, and the JSON
 * is `{"u": "<account>", "a": "<token id>"}`; the id is what the Mapbox
 * console lists for the token, and a rotated token gets a new one. Comparing
 * ids lets Architect recognise a revoked token without that token ever being
 * written down in this repository.
 *
 * Accepts the base64url alphabet Mapbox emits and the standard one, padded or
 * not, so a token that passed through a tool that re-encoded it still
 * resolves. Never throws: anything malformed yields null.
 */
export const getMapboxTokenId = (value: string): string | null => {
  const segments = value.split('.');
  if (segments.length !== 3) {
    return null;
  }
  const payload = segments[1];
  if (!payload) {
    return null;
  }

  try {
    const standard = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = standard.padEnd(
      standard.length + ((4 - (standard.length % 4)) % 4),
      '=',
    );
    const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));

    return typeof parsed === 'object' &&
      parsed !== null &&
      'a' in parsed &&
      typeof parsed.a === 'string'
      ? parsed.a
      : null;
  } catch {
    return null;
  }
};

// Ids of former testing tokens that have since been revoked in the Mapbox
// console. The first, the account's original default public token, was
// revoked on 2026-09-02 after third-party abuse ran up millions of raster-tile
// requests against it. Listed by id rather than by value so the revoked token
// itself appears nowhere in the repository: GitHub push protection blocks
// Mapbox-shaped literals, and `__tests__/mapbox-public-tokens.test.ts` allows
// only TESTING_MAPBOX_TOKEN. Kept only so Architect can warn about protocols
// that still carry one — `getUsesRetiredMapboxToken` drives the revoked-token
// banner — because Mapbox answers those tokens with 401 and every Geospatial
// map in such a protocol is broken until the researcher replaces it. A
// retired token must never be used for anything.
export const RETIRED_MAPBOX_TOKEN_IDS = ['cm6fh2tq7055i2kol6aqrgxma'] as const;
