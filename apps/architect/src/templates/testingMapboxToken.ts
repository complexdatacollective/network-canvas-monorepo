// Shared Mapbox public token embedded in templates that use the Geospatial
// interface (currently `transnational-networks`) so the map renders out of the
// box, and carried by the e2e protocol fixtures so the timeline warning below
// has something to detect. It is a sandbox token: URL-restricted to
// networkcanvas.com, networkcanvas.dev and localhost, and scoped to
// styles:tiles, styles:read and fonts:read only. It will not render maps on
// any other domain — including Fresco interview pages, which live on the
// researcher's own host — and it is for evaluation only: researchers must add
// their own Mapbox token before fielding a study. `getUsesTestingMapboxToken`
// detects its presence by value and surfaces that warning on the protocol
// timeline.
//
// This literal MUST stay identical to the `value` of the token asset in the
// templates' `assetManifest`; `__tests__/testing-token.test.ts` guards drift.
// It is also the ONLY Mapbox token allowed in the repository's protocol
// fixtures: `__tests__/mapbox-public-tokens.test.ts` fails on any other. The
// account's previous default public token, which used to sit here, was abused
// for millions of raster-tile requests in August 2026 and is being revoked.
export const TESTING_MAPBOX_TOKEN =
  'pk.eyJ1IjoibmV0d29ya2NhbnZhcyIsImEiOiJjbXRqdnd4dnowY2M5MnlzZWNqYjNlZG5rIn0.KH3OS_O2Hk6gAbDjKGPAJg';
