// Shared Mapbox access token embedded in templates that use the Geospatial
// interface (currently `transnational-networks`) so the map renders out of the
// box. It is rate-limited and for evaluation only — researchers must replace it
// with their own token before fielding a study. `getUsesTestingMapboxToken`
// detects its presence and surfaces a warning on the protocol timeline.
//
// This literal MUST stay identical to the `value` of the token asset in the
// templates' `assetManifest`; `__tests__/testing-token.test.ts` guards drift.
export const TESTING_MAPBOX_TOKEN =
  'pk.eyJ1IjoibmV0d29ya2NhbnZhcyIsImEiOiJjbTZmaDJ0cTcwNTVpMmtvbDZhcXJneG1hIn0.wI5ooUHDWwFsH4jLXo3CVw';
