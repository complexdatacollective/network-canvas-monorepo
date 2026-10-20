// Shared Mapbox public token embedded in protocols that use the Geospatial
// interface so the map renders out of the box: Architect's templates (currently
// `transnational-networks`), the e2e protocol fixtures, and the protocols
// Sketch drafts. Architect's timeline warning (`TestingMapboxTokenAlert`)
// detects it. It is a sandbox token: URL-restricted to networkcanvas.com,
// networkcanvas.dev and localhost, and scoped to styles:tiles, styles:read and
// fonts:read only. It will not render maps on any other domain — including
// Fresco interview pages, which live on the researcher's own host — and it is
// for evaluation only: researchers must add their own Mapbox token before
// fielding a study.
//
// This literal MUST stay identical to the `value` of the token asset in the
// Architect templates' `assetManifest`
// (`apps/architect/src/templates/__tests__/testing-token.test.ts` guards
// drift). It is also the ONLY Mapbox token allowed anywhere in the repository:
// `scripts/buildtime/check-mapbox-tokens.mjs` (run as `pnpm check:mapbox-tokens`
// in CI's quality-support job, on every change) scans every tracked file and
// every text entry inside every tracked archive and fails on any other.
export const TESTING_MAPBOX_TOKEN =
  'pk.eyJ1IjoibmV0d29ya2NhbnZhcyIsImEiOiJjbXRqdnd4dnowY2M5MnlzZWNqYjNlZG5rIn0.KH3OS_O2Hk6gAbDjKGPAJg';
