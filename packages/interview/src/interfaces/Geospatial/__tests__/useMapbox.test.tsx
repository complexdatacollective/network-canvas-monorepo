import { act, render } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// --- Module mocks (must appear before imports that use them) ---

// Minimal Mapbox Map stub. Mapbox never fires its own events in jsdom, so the
// stub keeps the listeners and layers of the map built last, and
// `mapEvents.fire` stands in for that map. `once`, `off` and `setFilter`
// behave as Mapbox's do. Hoisted so the (hoisted) vi.mock factory can
// reference it.
const { mapInstance, mapEvents, MapConstructor } = vi.hoisted(() => {
  type Listener = (event?: unknown) => void;
  type Registration = {
    type: string;
    layer: string | undefined;
    listener: Listener;
    once: boolean;
  };
  let registrations: Registration[] = [];
  const layers = new Set<string>();
  const register =
    (once: boolean) =>
    (type: string, layerOrListener: string | Listener, listener?: Listener) => {
      if (typeof layerOrListener !== 'string') {
        registrations.push({
          type,
          layer: undefined,
          listener: layerOrListener,
          once,
        });
      } else if (listener) {
        registrations.push({ type, layer: layerOrListener, listener, once });
      }
    };

  const instance = {
    on: vi.fn(register(false)),
    once: vi.fn(register(true)),
    off: vi.fn(
      (
        type: string,
        layerOrListener: string | Listener,
        listener?: Listener,
      ) => {
        const removed =
          typeof layerOrListener === 'string' ? listener : layerOrListener;
        registrations = registrations.filter(
          (registration) =>
            registration.type !== type || registration.listener !== removed,
        );
      },
    ),
    isStyleLoaded: vi.fn(() => true),
    addSource: vi.fn(),
    addLayer: vi.fn((layer: { id: string }) => {
      layers.add(layer.id);
    }),
    getLayer: vi.fn((id: string) => (layers.has(id) ? { id } : undefined)),
    getSource: vi.fn(),
    // Mapbox throws when a style that has not loaded is changed.
    setFilter: vi.fn((id: string) => {
      if (!layers.has(id)) throw new Error('Style is not done loading');
    }),
    resize: vi.fn(),
    remove: vi.fn(),
    getCanvas: vi.fn<() => HTMLCanvasElement>(),
    getContainer: vi.fn<() => HTMLElement>(),
    setLanguage: vi.fn(),
  };

  const events = {
    fire(type: string, layer?: string, event?: unknown) {
      const due = registrations.filter(
        (registration) =>
          registration.type === type && registration.layer === layer,
      );
      registrations = registrations.filter(
        (registration) => !(registration.once && due.includes(registration)),
      );
      for (const registration of due) registration.listener(event);
    },
    reset() {
      registrations = [];
      layers.clear();
    },
  };

  // A regular (non-arrow) function so it can be invoked with `new`.
  return {
    mapInstance: instance,
    mapEvents: events,
    MapConstructor: vi.fn(function MapMock(options: {
      container: HTMLElement;
      locale?: Record<string, string>;
    }) {
      events.reset();
      const canvas = document.createElement('canvas');
      canvas.setAttribute('aria-label', options.locale?.['Map.Title'] ?? 'Map');
      options.container.append(canvas);
      instance.getCanvas.mockReturnValue(canvas);
      instance.getContainer.mockReturnValue(options.container);
      return instance;
    }),
  };
});

// The library is downloaded once a map is wanted; each test settles that
// download before it looks at the map.
const { loadMapbox } = vi.hoisted(() => ({ loadMapbox: vi.fn() }));
vi.mock('../loadMapbox', () => ({ loadMapbox }));

vi.mock('../../../contract/context', () => ({
  useContractFlags: () => ({ isE2E: false }),
}));

vi.mock('../../../selectors/protocol', () => ({
  // `useSelector(makeGetApiKeyAssetValue)` resolves to the
  // `(tokenAssetId) => value` reader the hook then calls.
  makeGetApiKeyAssetValue: () => () => 'test-access-token',
}));

vi.mock('react-redux', () => ({
  useSelector: (selector: (state: unknown) => unknown) => selector({}),
}));

import { AnalyticsContext } from '../../../analytics/AnalyticsContext';
import { InterviewI18nProvider } from '../../../i18n/InterviewI18nProvider';
import { TestProtocolLocalization } from '../../__tests__/TestProtocolLocalization';
// The hook under test (imported after mocks are declared)
import {
  type ExtendedMapOptions,
  resolveProtocolThemeVariable,
  useMapbox,
} from '../useMapbox';

// --- ResizeObserver stub (mirrors hooks/__tests__/useNodeMeasurement.test.tsx) ---

let observerInstances: MockResizeObserver[];

class MockResizeObserver {
  callback: ResizeObserverCallback;
  observeSpy = vi.fn();
  disconnectSpy = vi.fn();

  constructor(cb: ResizeObserverCallback) {
    this.callback = cb;
    observerInstances.push(this);
  }

  observe(target: Element) {
    this.observeSpy(target);
  }

  disconnect() {
    this.disconnectSpy();
  }

  unobserve() {
    // no-op: required by ResizeObserver interface
  }
}

const triggerResize = () => {
  for (const obs of observerInstances) {
    obs.callback(
      [] as unknown as ResizeObserverEntry[],
      obs as unknown as ResizeObserver,
    );
  }
};

// requestAnimationFrame stub that defers callbacks so coalescing and
// cleanup-cancellation can be asserted deterministically.
let rafCallbacks: FrameRequestCallback[];
const cancelRaf = vi.fn();

const flushRaf = () => {
  const callbacks = rafCallbacks;
  rafCallbacks = [];
  for (const cb of callbacks) cb(0);
};

// Lets the mapbox-gl download, and the map built once it arrives, complete.
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

const baseMapOptions = {
  center: [0, 0],
  initialZoom: 0,
  tokenAssetId: 'token-asset',
  color: 'ord-color-seq-1',
  targetFeatureProperty: 'id',
  style: 'mapbox://styles/mapbox/streets-v12',
  showTransit: false,
} as unknown as ExtendedMapOptions;

it('resolves every supported sequence family', () => {
  expect(resolveProtocolThemeVariable('node-color-seq-3')).toBe('--node-3');
  expect(resolveProtocolThemeVariable('edge-color-seq-4')).toBe('--edge-4');
  expect(resolveProtocolThemeVariable('ord-color-seq-5')).toBe('--ord-5');
  expect(resolveProtocolThemeVariable('cat-color-seq-6')).toBe('--cat-6');
});

const ENGLISH_ONLY = { defaultLocale: 'en', locales: ['en'] };

// `locale` is the participant's stated protocol language; the interface
// language is set separately by the Shell and is not what the map labels follow.
function withProtocolLocale(
  locale: string,
  localization = {
    defaultLocale: 'en',
    locales: ['en', 'hu', 'pt-BR', 'pt-PT', 'zh-TW', 'sw', 'fil'],
  },
) {
  return (
    <TestProtocolLocalization localization={localization} locale={locale}>
      <TestHarness mapOptions={baseMapOptions} />
    </TestProtocolLocalization>
  );
}

const ignoreSelection = () => {
  // no-op: these tests do not pick an area
};

function TestHarness({
  mapOptions,
  initialSelectionValue,
  onSelectionChange = ignoreSelection,
}: {
  mapOptions: ExtendedMapOptions;
  initialSelectionValue?: string;
  onSelectionChange?: (value: string) => void;
}) {
  const { mapContainerRef } = useMapbox({
    mapOptions,
    dataSourceAssetId: null,
    dataSourceUrl: null,
    initialSelectionValue,
    onSelectionChange,
  });
  return <div data-testid="map" ref={mapContainerRef} />;
}

// useMapbox reads the protocol language, so the harness needs one.
function EnglishHarness(props: Parameters<typeof TestHarness>[0]) {
  return (
    <TestProtocolLocalization localization={ENGLISH_ONLY}>
      <TestHarness {...props} />
    </TestProtocolLocalization>
  );
}

beforeEach(() => {
  observerInstances = [];
  rafCallbacks = [];
  mapEvents.reset();
  mapInstance.on.mockClear();
  mapInstance.once.mockClear();
  mapInstance.off.mockClear();
  mapInstance.isStyleLoaded.mockReturnValue(true);
  mapInstance.setFilter.mockClear();
  mapInstance.resize.mockClear();
  mapInstance.remove.mockClear();
  mapInstance.setLanguage.mockClear();
  MapConstructor.mockClear();
  loadMapbox.mockReset();
  loadMapbox.mockResolvedValue({ Map: MapConstructor });
  cancelRaf.mockClear();
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    rafCallbacks.push(cb);
    return rafCallbacks.length;
  });
  vi.stubGlobal('cancelAnimationFrame', cancelRaf);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useMapbox resize handling', () => {
  it('observes the map container once the map is initialised', async () => {
    render(withProtocolLocale('en', ENGLISH_ONLY));
    await settle();

    expect(MapConstructor).toHaveBeenCalledTimes(1);
    expect(observerInstances).toHaveLength(1);
    expect(observerInstances[0]!.observeSpy).toHaveBeenCalled();
  });

  it('resizes the map (on the next frame) when the container resizes', async () => {
    render(withProtocolLocale('en', ENGLISH_ONLY));
    await settle();

    act(() => {
      triggerResize();
    });
    // The resize is coalesced into a requestAnimationFrame callback, so nothing
    // happens until the frame runs.
    expect(mapInstance.resize).not.toHaveBeenCalled();

    act(() => {
      flushRaf();
    });
    expect(mapInstance.resize).toHaveBeenCalledTimes(1);
  });

  it('coalesces multiple resize callbacks into a single resize per frame', async () => {
    render(withProtocolLocale('en', ENGLISH_ONLY));
    await settle();

    act(() => {
      triggerResize();
      triggerResize();
      triggerResize();
    });
    act(() => {
      flushRaf();
    });

    expect(mapInstance.resize).toHaveBeenCalledTimes(1);
  });

  it('disconnects the observer and cancels a pending frame on cleanup', async () => {
    const { unmount } = render(withProtocolLocale('en', ENGLISH_ONLY));
    await settle();

    // Schedule a frame without flushing it, so cleanup has something to cancel.
    act(() => {
      triggerResize();
    });
    act(() => {
      unmount();
    });

    expect(observerInstances[0]!.disconnectSpy).toHaveBeenCalled();
    expect(cancelRaf).toHaveBeenCalled();
    expect(mapInstance.remove).toHaveBeenCalled();
  });
});

// The map's own control names are read by screen readers only, so they are
// English whatever language the protocol is read in.
describe('useMapbox control names', () => {
  it('names the map in English when the protocol is read in another language', async () => {
    render(
      <InterviewI18nProvider>
        <TestProtocolLocalization
          localization={{ defaultLocale: 'es', locales: ['es'] }}
        >
          <TestHarness mapOptions={baseMapOptions} />
        </TestProtocolLocalization>
      </InterviewI18nProvider>,
    );
    await settle();
    expect(mapInstance.getCanvas()).toHaveAccessibleName('Map');
  });
});

describe('useMapbox highlighted area', () => {
  // The layer colours are resolved through a canvas, which jsdom lacks.
  beforeEach(() => {
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(null);
    return () => getContext.mockRestore();
  });

  const highlights = (value: string) =>
    ['selection', ['==', 'id', value]] as const;

  it('stops highlighting once no readable location is saved for the person shown', async () => {
    const { rerender } = render(
      <EnglishHarness
        mapOptions={baseMapOptions}
        initialSelectionValue="tract-a"
      />,
    );
    await settle();
    act(() => {
      mapEvents.fire('load');
    });
    expect(mapInstance.setFilter).toHaveBeenLastCalledWith(
      ...highlights('tract-a'),
    );

    rerender(<EnglishHarness mapOptions={baseMapOptions} />);
    await settle();

    expect(mapInstance.setFilter).toHaveBeenLastCalledWith(...highlights(''));
  });

  it('never restores an earlier location while tiles are still loading', async () => {
    // Mapbox reports its style as not loaded while any tile is loading.
    mapInstance.isStyleLoaded.mockReturnValue(false);
    const { rerender } = render(
      <EnglishHarness
        mapOptions={baseMapOptions}
        initialSelectionValue="tract-a"
      />,
    );
    await settle();
    act(() => {
      mapEvents.fire('load');
      mapEvents.fire('styledata');
    });
    expect(mapInstance.setFilter).toHaveBeenLastCalledWith(
      ...highlights('tract-a'),
    );

    rerender(<EnglishHarness mapOptions={baseMapOptions} />);
    await settle();
    expect(mapInstance.setFilter).toHaveBeenLastCalledWith(...highlights(''));

    act(() => {
      mapEvents.fire('styledata');
    });
    expect(mapInstance.setFilter).toHaveBeenLastCalledWith(...highlights(''));
  });

  it('highlights a picked area only once the pick is saved', async () => {
    const onSelectionChange = vi.fn();
    const { rerender } = render(
      <EnglishHarness
        mapOptions={baseMapOptions}
        onSelectionChange={onSelectionChange}
      />,
    );
    await settle();
    act(() => {
      mapEvents.fire('load');
    });

    act(() => {
      mapEvents.fire('click', 'layerToSelect', {
        features: [{ properties: { id: 'tract-b' } }],
      });
    });

    expect(onSelectionChange).toHaveBeenCalledWith('tract-b');
    expect(mapInstance.setFilter).not.toHaveBeenCalledWith(
      ...highlights('tract-b'),
    );

    rerender(
      <EnglishHarness
        mapOptions={baseMapOptions}
        initialSelectionValue="tract-b"
        onSelectionChange={onSelectionChange}
      />,
    );
    await settle();

    expect(mapInstance.setFilter).toHaveBeenLastCalledWith(
      ...highlights('tract-b'),
    );
  });

  it('highlights the saved location again once the map is rebuilt', async () => {
    const { rerender } = render(
      <EnglishHarness
        mapOptions={baseMapOptions}
        initialSelectionValue="tract-a"
      />,
    );
    await settle();
    act(() => {
      mapEvents.fire('load');
    });

    rerender(
      <EnglishHarness
        mapOptions={{ ...baseMapOptions, targetFeatureProperty: 'name' }}
        initialSelectionValue="tract-a"
      />,
    );
    await settle();
    expect(MapConstructor).toHaveBeenCalledTimes(2);

    act(() => {
      mapEvents.fire('load');
    });
    expect(mapInstance.setFilter).toHaveBeenLastCalledWith('selection', [
      '==',
      'name',
      'tract-a',
    ]);
  });
});

describe('useMapbox protocol language', () => {
  const constructedWith = () =>
    MapConstructor.mock.calls[0]?.[0] as unknown as { language?: string };

  it('labels the map in the protocol language from the first tiles', async () => {
    render(withProtocolLocale('hu'));
    await settle();

    expect(constructedWith().language).toBe('hu');
  });

  it('cuts a regional protocol language to the language Mapbox lists', async () => {
    render(withProtocolLocale('pt-BR'));
    await settle();

    expect(constructedWith().language).toBe('pt');
  });

  it('keeps the script of a Chinese protocol language', async () => {
    render(withProtocolLocale('zh-TW'));
    await settle();

    expect(constructedWith().language).toBe('zh-Hant');
  });

  it('sets no language when Mapbox has none, so labels show local names', async () => {
    render(withProtocolLocale('sw'));
    await settle();

    expect(constructedWith()).not.toHaveProperty('language');
  });

  it('follows the protocol language', async () => {
    render(
      <InterviewI18nProvider>{withProtocolLocale('hu')}</InterviewI18nProvider>,
    );
    await settle();

    expect(constructedWith().language).toBe('hu');
  });

  it('changes the live map language without recreating the map', async () => {
    const { rerender } = render(withProtocolLocale('en'));
    await settle();
    expect(constructedWith().language).toBe('en');
    expect(mapInstance.setLanguage).not.toHaveBeenCalled();

    rerender(withProtocolLocale('hu'));
    await settle();

    expect(mapInstance.setLanguage).toHaveBeenCalledTimes(1);
    expect(mapInstance.setLanguage).toHaveBeenLastCalledWith('hu');
    expect(MapConstructor).toHaveBeenCalledTimes(1);
    expect(mapInstance.remove).not.toHaveBeenCalled();
  });

  it('removes the map language when the new protocol language has no labels', async () => {
    const { rerender } = render(withProtocolLocale('hu'));
    await settle();

    rerender(withProtocolLocale('sw'));
    await settle();

    expect(mapInstance.setLanguage).toHaveBeenLastCalledWith(undefined);
    expect(MapConstructor).toHaveBeenCalledTimes(1);
  });

  it('does not touch the map when another protocol language maps to the same Mapbox language', async () => {
    const { rerender } = render(withProtocolLocale('pt-BR'));
    await settle();
    expect(constructedWith().language).toBe('pt');

    rerender(withProtocolLocale('pt-PT'));
    await settle();

    expect(mapInstance.setLanguage).not.toHaveBeenCalled();
    expect(MapConstructor).toHaveBeenCalledTimes(1);
  });

  it('labels the map in Tagalog for a Filipino protocol language', async () => {
    // A protocol's locales are canonical, so Tagalog arrives as `fil`; Mapbox
    // spells it `tl`.
    render(withProtocolLocale('fil'));
    await settle();

    expect(constructedWith().language).toBe('tl');
  });
});

// Rendered as an interface is inside the Shell, in an English-only protocol;
// a rerender keeps the wrapper.
function InEnglish({ children }: { children: ReactNode }) {
  return (
    <TestProtocolLocalization localization={ENGLISH_ONLY}>
      {children}
    </TestProtocolLocalization>
  );
}
const renderInEnglish = (ui: ReactElement) =>
  render(ui, { wrapper: InEnglish });

describe('useMapbox highlighted area', () => {
  // The layer colours are resolved through a canvas, which jsdom lacks.
  beforeEach(() => {
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(null);
    return () => getContext.mockRestore();
  });

  const highlights = (value: string) =>
    ['selection', ['==', 'id', value]] as const;

  it('stops highlighting a saved location once it can no longer be read', async () => {
    const { rerender } = renderInEnglish(
      <TestHarness
        mapOptions={baseMapOptions}
        initialSelectionValue="tract-a"
      />,
    );
    await settle();
    act(() => {
      mapEvents.fire('load');
    });
    expect(mapInstance.setFilter).toHaveBeenLastCalledWith(
      ...highlights('tract-a'),
    );

    rerender(<TestHarness mapOptions={baseMapOptions} />);
    await settle();

    expect(mapInstance.setFilter).toHaveBeenLastCalledWith(...highlights(''));
  });

  it('follows the saved location while tiles are still loading', async () => {
    // Mapbox reports its style as not loaded while any tile is loading.
    mapInstance.isStyleLoaded.mockReturnValue(false);
    const { rerender } = renderInEnglish(
      <TestHarness
        mapOptions={baseMapOptions}
        initialSelectionValue="tract-a"
      />,
    );
    await settle();
    act(() => {
      mapEvents.fire('load');
      mapEvents.fire('styledata');
    });
    expect(mapInstance.setFilter).toHaveBeenLastCalledWith(
      ...highlights('tract-a'),
    );

    rerender(<TestHarness mapOptions={baseMapOptions} />);
    await settle();
    expect(mapInstance.setFilter).toHaveBeenLastCalledWith(...highlights(''));

    act(() => {
      mapEvents.fire('styledata');
    });
    expect(mapInstance.setFilter).toHaveBeenLastCalledWith(...highlights(''));
  });

  it('highlights a picked area only once the pick is saved', async () => {
    const onSelectionChange = vi.fn();
    const { rerender } = renderInEnglish(
      <TestHarness
        mapOptions={baseMapOptions}
        onSelectionChange={onSelectionChange}
      />,
    );
    await settle();
    act(() => {
      mapEvents.fire('load');
    });

    act(() => {
      mapEvents.fire('click', 'layerToSelect', {
        features: [{ properties: { id: 'tract-b' } }],
      });
    });

    expect(onSelectionChange).toHaveBeenCalledWith('tract-b');
    expect(mapInstance.setFilter).not.toHaveBeenCalledWith(
      ...highlights('tract-b'),
    );

    rerender(
      <TestHarness
        mapOptions={baseMapOptions}
        initialSelectionValue="tract-b"
        onSelectionChange={onSelectionChange}
      />,
    );
    await settle();

    expect(mapInstance.setFilter).toHaveBeenLastCalledWith(
      ...highlights('tract-b'),
    );
  });

  it('highlights the saved location again once the map is rebuilt', async () => {
    const { rerender } = renderInEnglish(
      <TestHarness
        mapOptions={baseMapOptions}
        initialSelectionValue="tract-a"
      />,
    );
    await settle();
    act(() => {
      mapEvents.fire('load');
    });

    rerender(
      <TestHarness
        mapOptions={{ ...baseMapOptions, targetFeatureProperty: 'name' }}
        initialSelectionValue="tract-a"
      />,
    );
    await settle();
    expect(MapConstructor).toHaveBeenCalledTimes(2);

    act(() => {
      mapEvents.fire('load');
    });
    expect(mapInstance.setFilter).toHaveBeenLastCalledWith('selection', [
      '==',
      'name',
      'tract-a',
    ]);
  });
});

describe('useMapbox readiness', () => {
  // The layer colours are resolved through a canvas, which jsdom lacks.
  beforeEach(() => {
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(null);
    return () => getContext.mockRestore();
  });

  function ReadinessHarness({
    mapOptions,
  }: {
    mapOptions: ExtendedMapOptions;
  }) {
    const { mapContainerRef, map, isStageReady } = useMapbox({
      mapOptions,
      dataSourceAssetId: null,
      dataSourceUrl: null,
      onSelectionChange: ignoreSelection,
    });
    return (
      <div
        data-testid="map"
        ref={mapContainerRef}
        data-has-map={String((map as unknown) === mapInstance)}
        data-ready={String(isStageReady)}
      />
    );
  }

  const state = (element: HTMLElement) => ({
    hasMap: element.dataset.hasMap,
    ready: element.dataset.ready,
  });

  it('hands over the map once it has loaded, and is ready once it is idle', async () => {
    const { getByTestId } = renderInEnglish(
      <ReadinessHarness mapOptions={baseMapOptions} />,
    );
    await settle();
    expect(state(getByTestId('map'))).toEqual({
      hasMap: 'false',
      ready: 'false',
    });

    act(() => {
      mapEvents.fire('load');
    });
    expect(state(getByTestId('map'))).toEqual({
      hasMap: 'true',
      ready: 'false',
    });

    act(() => {
      mapEvents.fire('idle');
    });
    expect(state(getByTestId('map'))).toEqual({
      hasMap: 'true',
      ready: 'true',
    });
  });

  it('starts again from nothing when the map is rebuilt', async () => {
    const { getByTestId, rerender } = renderInEnglish(
      <ReadinessHarness mapOptions={baseMapOptions} />,
    );
    await settle();
    act(() => {
      mapEvents.fire('load');
      mapEvents.fire('idle');
    });
    expect(state(getByTestId('map')).ready).toBe('true');

    rerender(
      <ReadinessHarness
        mapOptions={{ ...baseMapOptions, targetFeatureProperty: 'name' }}
      />,
    );
    await settle();
    expect(MapConstructor).toHaveBeenCalledTimes(2);
    expect(state(getByTestId('map'))).toEqual({
      hasMap: 'false',
      ready: 'false',
    });

    act(() => {
      mapEvents.fire('load');
      mapEvents.fire('idle');
    });
    expect(state(getByTestId('map'))).toEqual({
      hasMap: 'true',
      ready: 'true',
    });
  });
});

describe('useMapbox library download', () => {
  const captureException = vi.fn();
  const tracker = { track: vi.fn(), captureException };

  function DownloadHarness({ mapOptions }: { mapOptions: ExtendedMapOptions }) {
    const { mapContainerRef, mapError } = useMapbox({
      mapOptions,
      dataSourceAssetId: null,
      dataSourceUrl: null,
      onSelectionChange: ignoreSelection,
    });
    return (
      <div
        data-testid="map"
        ref={mapContainerRef}
        data-error={mapError?.message ?? ''}
      />
    );
  }

  function InAnalytics({ children }: { children: ReactNode }) {
    return (
      <AnalyticsContext.Provider value={tracker}>
        <InEnglish>{children}</InEnglish>
      </AnalyticsContext.Provider>
    );
  }

  // Holds the library back until the returned function is called.
  const holdLibrary = () => {
    let arrive: (() => void) | undefined;
    loadMapbox.mockReturnValue(
      new Promise((resolve) => {
        arrive = () => resolve({ Map: MapConstructor });
      }),
    );
    return () => arrive?.();
  };

  beforeEach(() => {
    captureException.mockClear();
  });

  it('builds no map when the stage is left before the library arrives', async () => {
    const arrive = holdLibrary();
    const { unmount } = render(
      <DownloadHarness mapOptions={baseMapOptions} />,
      { wrapper: InAnalytics },
    );
    expect(loadMapbox).toHaveBeenCalled();

    unmount();
    arrive();
    await settle();

    expect(MapConstructor).not.toHaveBeenCalled();
    expect(observerInstances).toHaveLength(0);
    expect(captureException).not.toHaveBeenCalled();
  });

  it('builds only the map for the latest inputs when they change before the library arrives', async () => {
    const arrive = holdLibrary();
    const { rerender } = render(
      <DownloadHarness mapOptions={baseMapOptions} />,
      { wrapper: InAnalytics },
    );
    rerender(
      <DownloadHarness
        mapOptions={{ ...baseMapOptions, targetFeatureProperty: 'name' }}
      />,
    );

    arrive();
    await settle();

    expect(MapConstructor).toHaveBeenCalledTimes(1);
    expect(observerInstances).toHaveLength(1);
  });

  it('reports a library that fails to download and shows the map as unavailable', async () => {
    const failure = new Error('Failed to fetch dynamically imported module');
    loadMapbox.mockRejectedValue(failure);
    const { getByTestId } = render(
      <DownloadHarness mapOptions={baseMapOptions} />,
      { wrapper: InAnalytics },
    );
    await settle();

    expect(MapConstructor).not.toHaveBeenCalled();
    expect(captureException).toHaveBeenCalledWith(failure, {
      feature: 'geospatial-map-init',
    });
    expect(getByTestId('map').dataset.error).toBe(failure.message);
  });
});
