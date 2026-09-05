import { expect, vi } from 'vitest';

/**
 * The Mapbox SDK, replaced.
 *
 * NOTHING in this package's tests may build a real Mapbox map. A real one
 * fetches a style, tiles, sprites, and fonts from Mapbox's servers — billed
 * requests against a live account, from a test suite that runs on every push —
 * and needs a WebGL context jsdom does not have. Every test file that mounts
 * anything drawing a map therefore replaces the module, and asserts that it
 * did: `expectMapboxMocked` is called by each of those files, so a mock that
 * is removed or silently stops applying fails the suite instead of quietly
 * reaching the network.
 *
 * Used as:
 *
 * ```ts
 * vi.mock('mapbox-gl/esm', async () => {
 *   const { createMapboxMock } = await import('./mapboxMock.ts');
 *   return createMapboxMock();
 * });
 * ```
 *
 * The factory is hoisted above the file's imports, which is why it reaches
 * this module through a dynamic import rather than a binding.
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
 * A `vi.mock` factory is evaluated in its own module registry, so the copy of
 * this file the factory imports is NOT the copy the test file imports. State
 * held here would be written by the map and read by nobody — every assertion
 * about what was built would pass on an empty array, which is the one way this
 * guard could fail open.
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

export function createMapboxMock(): Record<string, unknown> {
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
      state().removed += 1;
    },
  };

  return {
    Map: vi.fn(function MapboxMap(options: MapboxMapOptions) {
      state().built.push(options);
      return instance;
    }),
    NavigationControl: vi.fn(function NavigationControl() {
      return {};
    }),
  };
}

/**
 * Refuses to continue unless the SDK reaching the editor is the mock.
 *
 * Asserted against the module the editor itself imports, so a change to the
 * specifier, to the mock's shape, or to vitest's module resolution is caught
 * here rather than by a billing alert.
 */
export async function expectMapboxMocked(): Promise<void> {
  const mapbox = await import('mapbox-gl/esm');
  expect(
    vi.isMockFunction(mapbox.Map),
    'mapbox-gl/esm is NOT mocked in this test file: a real Mapbox map would be built.',
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
