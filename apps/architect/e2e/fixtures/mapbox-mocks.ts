import type { BrowserContext } from '@playwright/test';

const corsHeaders = { 'access-control-allow-origin': '*' };

/**
 * Minimal mapbox style document served in place of the real style
 * (mapbox://styles/...). With no sources or symbol layers in the style,
 * mapbox-gl never requests street tiles, sprites, or glyphs, so the
 * basemap renders as a flat background. The app's own layers (GeoJSON
 * outline/selection from the local asset server, transit from the
 * mocked TileJSON below) render on top as normal.
 *
 * The glyphs template is required for the app's transit-labels layer to
 * pass style validation (a text-field layer without style glyphs is
 * rejected with a console error). Glyph URLs resolve to the 204
 * interceptor below, and with all transit tiles empty no glyph is ever
 * actually requested.
 */
const MINIMAL_STYLE = {
  version: 8,
  name: 'e2e-minimal',
  glyphs: 'https://api.mapbox.com/fonts/v1/mapbox/{fontstack}/{range}.pbf',
  sources: {},
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': '#e8e7e3' },
    },
  ],
};

/**
 * Minimal TileJSON for the mapbox-streets-v8 vector source the app adds
 * for transit layers. The tile template points back at api.mapbox.com so
 * tile requests hit the interceptor below, which answers 204 ("no tile")
 * — the source still counts as loaded, keeping data-map-idle semantics.
 */
const STREETS_TILEJSON = {
  tilejson: '3.0.0',
  name: 'mapbox.mapbox-streets-v8',
  tiles: [
    'https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/{z}/{x}/{y}.vector.pbf',
  ],
  minzoom: 0,
  maxzoom: 16,
  vector_layers: [
    { id: 'road', fields: {} },
    { id: 'transit_stop_label', fields: {} },
  ],
};

const MAPBOX_HOST = /^https?:\/\/([^/]+\.)?mapbox\.com\//;

/**
 * Intercept all Mapbox network traffic with deterministic fixtures, and fail
 * closed on anything they do not answer.
 *
 * Live tiles are not part of what these tests assert, and they made the
 * suite nondeterministic two ways: Mapbox can update tile content under
 * a committed baseline, and slow tile loads have stalled data-map-idle
 * past the test timeout. The search API is mocked for the same reason —
 * results vary by region/session, and a failed retrieve silently skips
 * the fly-to.
 *
 * Installed by the `architect-test` fixture on the browser CONTEXT before its
 * first page navigates: MapView creates the map during render (inside a rAF),
 * so the routes have to exist before any goto that can reach a Geospatial
 * editor, and context routes cover every page the context ever opens — the
 * fixture's own, tabs a spec creates with `context.newPage()`, and the preview
 * popup, where the interview runtime's Geospatial stage would mount a real map.
 *
 * Returns the live record of requests no mock answered. Each one is aborted —
 * so it can never bill the shared testing token the all-interfaces fixture
 * carries — and recorded as method + path (the query string carries the token
 * and is dropped), so the caller can fail the test that caused it once the
 * context is done. Without the record a missing mock would surface only as a
 * map that quietly errors, or not at all: the test that mounted it may never
 * look at the map.
 */
export async function installMapboxMocks(
  context: BrowserContext,
): Promise<readonly string[]> {
  // Registered FIRST so it matches LAST: Playwright checks routes in reverse
  // registration order, so every specific mock below takes precedence and only
  // what none of them claims falls through to here.
  const escaped: string[] = [];
  await context.route(MAPBOX_HOST, (route, request) => {
    const { origin, pathname } = new URL(request.url());
    escaped.push(`${request.method()} ${origin}${pathname}`);
    return route.abort();
  });

  // Billing/session probe (mapbox-gl v3 `map-sessions/v1`). Left unmocked it
  // reaches the real API, whose 401 for the fake e2e token makes mapbox-gl
  // revoke auth: the painter permanently stops drawing and the canvas is
  // cleared, while load/idle events (and data-map-idle) have already fired.
  // Whether the 401 lands before or after a capture is a network race, so
  // screenshots flip between a rendered map and a blank panel per attempt.
  await context.route(/https:\/\/api\.mapbox\.com\/map-sessions\//, (route) =>
    route.fulfill({ headers: corsHeaders, json: {} }),
  );

  await context.route(/https:\/\/api\.mapbox\.com\/styles\/v1\//, (route) =>
    route.fulfill({ headers: corsHeaders, json: MINIMAL_STYLE }),
  );

  // Vector tiles, sprites, glyphs: 204 = "resource is empty", which
  // mapbox-gl handles gracefully without erroring the source. The .json
  // check reads the URL pathname because real requests carry an
  // access_token query string.
  await context.route(
    /https:\/\/api\.mapbox\.com\/(v4|fonts|tiles)\//,
    (route, request) =>
      new URL(request.url()).pathname.endsWith('.json')
        ? route.fulfill({ headers: corsHeaders, json: STREETS_TILEJSON })
        : route.fulfill({ status: 204, headers: corsHeaders }),
  );

  // Registered after the (v4|fonts|tiles) catch-all: Playwright checks
  // routes in reverse registration order, so the specific TileJSON mock
  // must come later to win for this URL.
  await context.route(
    /https:\/\/api\.mapbox\.com\/v4\/mapbox\.mapbox-streets-v8\.json/,
    (route) => route.fulfill({ headers: corsHeaders, json: STREETS_TILEJSON }),
  );

  await context.route(/https:\/\/events\.mapbox\.com\//, (route) =>
    route.fulfill({ status: 204, headers: corsHeaders }),
  );

  await context.route(
    /https:\/\/api\.mapbox\.com\/search\/searchbox\/v1\/suggest/,
    (route) =>
      route.fulfill({
        headers: corsHeaders,
        json: {
          suggestions: [
            {
              name: 'Sidetrack',
              mapbox_id: 'e2e-mock-sidetrack',
              feature_type: 'poi',
              place_formatted: 'Chicago, Illinois, United States',
              language: 'en',
              maki: 'marker',
            },
          ],
          attribution: 'e2e mock',
          response_id: 'e2e-mock-response',
        },
      }),
  );

  await context.route(
    /https:\/\/api\.mapbox\.com\/search\/searchbox\/v1\/retrieve\//,
    (route) =>
      route.fulfill({
        headers: corsHeaders,
        json: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [-87.6497, 41.9399] },
              properties: {
                name: 'Sidetrack',
                mapbox_id: 'e2e-mock-sidetrack',
                feature_type: 'poi',
              },
            },
          ],
          attribution: 'e2e mock',
        },
      }),
  );
  return escaped;
}
