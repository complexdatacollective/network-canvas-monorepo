import { expect, vi } from 'vitest';

/**
 * The Mapbox SDK, replaced — this module IS `mapbox-gl` for the whole suite.
 *
 * NOTHING in this package's tests may build a real Mapbox map. A real one
 * fetches a style, tiles, sprites, and fonts from Mapbox's servers — billed
 * requests against a live account, from a test suite that runs on every push —
 * and needs a WebGL context jsdom does not have.
 *
 * `vitest.config.ts` aliases `mapbox-gl` and `mapbox-gl/esm` here, so a test
 * reaches this whatever it imports and whichever module reached the SDK on its
 * behalf. No test file asks for the replacement, which is the point: the
 * package's registry imports every editor family, so most of the suite has the
 * geospatial editor in its module graph, and a rule each of those files had to
 * remember would be forgotten by exactly the file at risk.
 *
 * Kept in `src/testing/` rather than beside the editor that draws a map,
 * because the alias is a fact about the whole package and every editor family
 * lands on a branch of its own: a target inside one family's directory does
 * not exist on the other branches, so their runs would resolve the alias to
 * nothing. `.storybook/mapboxMock.ts` is the same replacement for stories,
 * separate only because it cannot import `vitest`.
 *
 * The exports below are the SDK's own surface, as a map preview uses it.
 * Everything else here is the recording the tests read.
 */
export type MapboxMapOptions = Readonly<{
  container?: unknown;
  style?: unknown;
  center?: unknown;
  zoom?: unknown;
  accessToken?: unknown;
  transformRequest?: unknown;
}>;

type MapboxMockState = {
  /** Every map this suite built, with the options it was built from. */
  built: MapboxMapOptions[];
  handlers: Map<string, () => void>;
  controls: number;
  removed: number;
  center: { lng: number; lat: number };
  zoom: number;
};

/**
 * The recording lives on the global scope, not in this module.
 *
 * The map writes it and the test reads it, and the two only agree while they
 * hold the same copy of this module. A runner that ended up with two — a
 * `vi.mock` registry, a second resolution of the alias — would leave every
 * assertion about what was built passing against an array nothing writes to,
 * which is the one way this guard could fail open. `expectMapboxMocked` proves
 * it has not by building a map and reading it back.
 */
type MapboxMockScope = typeof globalThis & {
  __protocolBuilderMapboxMock?: MapboxMockState;
};

const freshState = (): MapboxMockState => ({
  built: [],
  handlers: new Map(),
  controls: 0,
  removed: 0,
  center: { lng: 0, lat: 0 },
  zoom: 0,
});

function state(): MapboxMockState {
  const scope = globalThis as MapboxMockScope;
  scope.__protocolBuilderMapboxMock ??= freshState();
  return scope.__protocolBuilderMapboxMock;
}

/** Every map built since the last reset, with the options it was given. */
export function mapsBuilt(): readonly MapboxMapOptions[] {
  return state().built;
}

/** How many maps have been torn down, so a leaked one is visible. */
export function mapsRemoved(): number {
  return state().removed;
}

/** How many controls were added to the map. */
export function mapControlsAdded(): number {
  return state().controls;
}

/** Where the researcher has panned and zoomed the map to. */
export function setMapView(
  center: Readonly<{ lng: number; lat: number }>,
  zoom: number,
): void {
  const current = state();
  current.center = { lng: center.lng, lat: center.lat };
  current.zoom = zoom;
}

export function resetMapboxMock(): void {
  (globalThis as MapboxMockScope).__protocolBuilderMapboxMock = freshState();
}

/** Runs the handler the component registered for one map event. */
export function emitMapEvent(event: string): void {
  const handler = state().handlers.get(event);
  if (handler === undefined) {
    throw new Error(
      `The map registered no "${event}" handler. It registered: ${[...state().handlers.keys()].join(', ') || 'nothing'}.`,
    );
  }
  handler();
}

/**
 * The one map instance every `new Map()` answers with.
 *
 * Shared rather than built per map, because everything a test asks about a map
 * — where it is, what it registered, whether it was torn down — is kept in the
 * recording above, and a preview only ever holds one at a time.
 */
const instance = {
  addControl: () => {
    state().controls += 1;
    return instance;
  },
  getCenter: () => state().center,
  getZoom: () => state().zoom,
  on: (event: string, handler: () => void) => {
    state().handlers.set(event, handler);
    return instance;
  },
  remove: () => {
    // The handler table goes with the map, as it does in the Storybook mock
    // and in the SDK: a removed map is torn down, and its callbacks belong to
    // a component that has unmounted. Left standing, `emitMapEvent` after a
    // teardown called into that component — which is the very thing a test
    // asserting a map preview cleans up after itself is trying to rule out —
    // and the next map built inherited handlers it never registered, so a
    // component that registers no `move` handler still answered one.
    state().handlers.clear();
    state().removed += 1;
  },
};

/**
 * The SDK's own two exports, which is all a map preview uses.
 *
 * Spies rather than plain functions: `expectMapboxMocked` reads
 * `vi.isMockFunction` to prove the module reaching the editor is this one and
 * not the real SDK, which no other property of the value could establish.
 */
const MapboxMapMock = vi.fn(function MapboxMap(options: MapboxMapOptions) {
  state().built.push(options);
  return instance;
});

const NavigationControlMock = vi.fn(function NavigationControl() {
  return {};
});

// Exported under the SDK's names rather than declared with them: a module-level
// `const Map` would shadow the built-in this file's own recording is keyed on.
export { MapboxMapMock as Map, NavigationControlMock as NavigationControl };

/**
 * Refuses to continue unless the SDK reaching the editors is the mock.
 *
 * Asked of the specifier a map preview itself imports, so a change to the
 * alias, to the specifier, or to vitest's module resolution is caught here
 * rather than by a billing alert. It is what makes the alias a checked fact
 * rather than a line of configuration nobody reads — and the only half of the
 * guard that still means something on a branch where no editor draws a map
 * yet.
 */
export async function expectMapboxMocked(): Promise<void> {
  const mapbox = await import('mapbox-gl/esm');
  expect(
    vi.isMockFunction(mapbox.Map),
    'mapbox-gl/esm is NOT replaced in this test run: a real Mapbox map would be built.',
  ).toBe(true);
  expect(vi.isMockFunction(mapbox.NavigationControl)).toBe(true);

  // The recording has to be the one this file reads, or every assertion about
  // what was built would pass against an array nothing writes to.
  const before = mapsBuilt().length;
  const probe = new mapbox.Map({ container: document.createElement('div') });
  probe.remove();
  expect(
    mapsBuilt().length,
    'the mapbox mock is recording somewhere this test cannot read.',
  ).toBe(before + 1);
  resetMapboxMock();
}
