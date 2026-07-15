import type { Page } from '@playwright/test';

const corsHeaders = { 'access-control-allow-origin': '*' };

/**
 * Minimal mapbox style document served in place of the real style
 * (mapbox://styles/...). With no sources or symbol layers in the style,
 * mapbox-gl never requests street tiles, sprites, or glyphs, so the
 * basemap renders as a flat background. The app's own layers (GeoJSON
 * outline/selection from the local asset server, transit from the
 * mocked TileJSON below) render on top as normal.
 */
const MINIMAL_STYLE = {
  version: 8,
  name: 'e2e-minimal',
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

/**
 * Intercept all Mapbox network traffic with deterministic fixtures.
 *
 * Live tiles are not part of what these tests assert, and they made the
 * suite nondeterministic two ways: Mapbox can update tile content under
 * a committed baseline, and slow tile loads have stalled data-map-idle
 * past the test timeout. The search API is mocked for the same reason —
 * results vary by region/session, and a failed retrieve silently skips
 * the fly-to.
 *
 * Installed once on the shared page, before any stage mounts a map.
 * Stub-mode browsers (firefox/webkit) never request these URLs.
 */
export async function installMapboxMocks(page: Page): Promise<void> {
  // Billing/session probe (mapbox-gl v3 `map-sessions/v1`). Left unmocked it
  // reaches the real API, whose 401 for the fake e2e token makes mapbox-gl
  // revoke auth: the painter permanently stops drawing and the canvas is
  // cleared, while load/idle events (and data-map-idle) have already fired.
  // Whether the 401 lands before or after a capture is a network race, so
  // screenshots flip between a rendered map and a blank panel per attempt.
  await page.route(/https:\/\/api\.mapbox\.com\/map-sessions\//, (route) =>
    route.fulfill({ headers: corsHeaders, json: {} }),
  );

  await page.route(/https:\/\/api\.mapbox\.com\/styles\/v1\//, (route) =>
    route.fulfill({ headers: corsHeaders, json: MINIMAL_STYLE }),
  );

  await page.route(
    /https:\/\/api\.mapbox\.com\/v4\/mapbox\.mapbox-streets-v8\.json/,
    (route) => route.fulfill({ headers: corsHeaders, json: STREETS_TILEJSON }),
  );

  // Vector tiles, sprites, glyphs: 204 = "resource is empty", which
  // mapbox-gl handles gracefully without erroring the source.
  await page.route(
    /https:\/\/api\.mapbox\.com\/(v4|fonts|tiles)\//,
    (route, request) =>
      request.url().endsWith('.json')
        ? route.fulfill({ headers: corsHeaders, json: STREETS_TILEJSON })
        : route.fulfill({ status: 204, headers: corsHeaders }),
  );

  await page.route(/https:\/\/events\.mapbox\.com\//, (route) =>
    route.fulfill({ status: 204, headers: corsHeaders }),
  );

  await page.route(
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

  await page.route(
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
}
