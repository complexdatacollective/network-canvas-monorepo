import { act, render } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

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

vi.mock('mapbox-gl/esm', () => ({
  Map: MapConstructor,
}));

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

import { interviewCatalogSource } from '../../../i18n/catalog';
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

// Loaded before anything renders, as a host loads a language before it
// mounts an interview, so renders in these languages are synchronous.
beforeAll(async () => {
  await Promise.all(
    ['es', 'en-GB'].map((locale) => interviewCatalogSource.load(locale)),
  );
});

describe('useMapbox resize handling', () => {
  it('observes the map container once the map is initialised', () => {
    render(withProtocolLocale('en', ENGLISH_ONLY));

    expect(MapConstructor).toHaveBeenCalledTimes(1);
    expect(observerInstances).toHaveLength(1);
    expect(observerInstances[0]!.observeSpy).toHaveBeenCalled();
  });

  it('resizes the map (on the next frame) when the container resizes', () => {
    render(withProtocolLocale('en', ENGLISH_ONLY));

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

  it('coalesces multiple resize callbacks into a single resize per frame', () => {
    render(withProtocolLocale('en', ENGLISH_ONLY));

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

  it('disconnects the observer and cancels a pending frame on cleanup', () => {
    const { unmount } = render(withProtocolLocale('en', ENGLISH_ONLY));

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

describe('useMapbox built-in locale changes', () => {
  it('updates the existing map canvas when the Shell language changes without recreating or removing the map', () => {
    const tree = (locale: string) => (
      <InterviewI18nProvider requestedLocale={locale}>
        <TestProtocolLocalization localization={ENGLISH_ONLY}>
          <TestHarness mapOptions={baseMapOptions} />
        </TestProtocolLocalization>
      </InterviewI18nProvider>
    );
    const { rerender } = render(tree('en'));
    const canvas = mapInstance.getCanvas();
    expect(canvas).toHaveAccessibleName('Map');
    expect(MapConstructor).toHaveBeenCalledTimes(1);

    rerender(tree('es'));
    expect(mapInstance.getCanvas()).toBe(canvas);
    expect(canvas).toHaveAccessibleName('Mapa');
    expect(MapConstructor).toHaveBeenCalledTimes(1);
    expect(mapInstance.remove).not.toHaveBeenCalled();

    rerender(tree('en-GB'));
    expect(canvas).toHaveAccessibleName('Map');
    expect(MapConstructor).toHaveBeenCalledTimes(1);
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

  it('stops highlighting once no readable location is saved for the person shown', () => {
    const { rerender } = render(
      <EnglishHarness
        mapOptions={baseMapOptions}
        initialSelectionValue="tract-a"
      />,
    );
    act(() => {
      mapEvents.fire('load');
    });
    expect(mapInstance.setFilter).toHaveBeenLastCalledWith(
      ...highlights('tract-a'),
    );

    rerender(<EnglishHarness mapOptions={baseMapOptions} />);

    expect(mapInstance.setFilter).toHaveBeenLastCalledWith(...highlights(''));
  });

  it('never restores an earlier location while tiles are still loading', () => {
    // Mapbox reports its style as not loaded while any tile is loading.
    mapInstance.isStyleLoaded.mockReturnValue(false);
    const { rerender } = render(
      <EnglishHarness
        mapOptions={baseMapOptions}
        initialSelectionValue="tract-a"
      />,
    );
    act(() => {
      mapEvents.fire('load');
      mapEvents.fire('styledata');
    });
    expect(mapInstance.setFilter).toHaveBeenLastCalledWith(
      ...highlights('tract-a'),
    );

    rerender(<EnglishHarness mapOptions={baseMapOptions} />);
    expect(mapInstance.setFilter).toHaveBeenLastCalledWith(...highlights(''));

    act(() => {
      mapEvents.fire('styledata');
    });
    expect(mapInstance.setFilter).toHaveBeenLastCalledWith(...highlights(''));
  });

  it('highlights a picked area only once the pick is saved', () => {
    const onSelectionChange = vi.fn();
    const { rerender } = render(
      <EnglishHarness
        mapOptions={baseMapOptions}
        onSelectionChange={onSelectionChange}
      />,
    );
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

    expect(mapInstance.setFilter).toHaveBeenLastCalledWith(
      ...highlights('tract-b'),
    );
  });

  it('highlights the saved location again once the map is rebuilt', () => {
    const { rerender } = render(
      <EnglishHarness
        mapOptions={baseMapOptions}
        initialSelectionValue="tract-a"
      />,
    );
    act(() => {
      mapEvents.fire('load');
    });

    rerender(
      <EnglishHarness
        mapOptions={{ ...baseMapOptions, targetFeatureProperty: 'name' }}
        initialSelectionValue="tract-a"
      />,
    );
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

  it('labels the map in the protocol language from the first tiles', () => {
    render(withProtocolLocale('hu'));

    expect(constructedWith().language).toBe('hu');
  });

  it('cuts a regional protocol language to the language Mapbox lists', () => {
    render(withProtocolLocale('pt-BR'));

    expect(constructedWith().language).toBe('pt');
  });

  it('keeps the script of a Chinese protocol language', () => {
    render(withProtocolLocale('zh-TW'));

    expect(constructedWith().language).toBe('zh-Hant');
  });

  it('sets no language when Mapbox has none, so labels show local names', () => {
    render(withProtocolLocale('sw'));

    expect(constructedWith()).not.toHaveProperty('language');
  });

  it('follows the protocol language, not the interface language', () => {
    render(
      <InterviewI18nProvider requestedLocale="es">
        {withProtocolLocale('hu')}
      </InterviewI18nProvider>,
    );

    expect(constructedWith().language).toBe('hu');
  });

  it('changes the live map language without recreating the map', () => {
    const { rerender } = render(withProtocolLocale('en'));
    expect(constructedWith().language).toBe('en');
    expect(mapInstance.setLanguage).not.toHaveBeenCalled();

    rerender(withProtocolLocale('hu'));

    expect(mapInstance.setLanguage).toHaveBeenCalledTimes(1);
    expect(mapInstance.setLanguage).toHaveBeenLastCalledWith('hu');
    expect(MapConstructor).toHaveBeenCalledTimes(1);
    expect(mapInstance.remove).not.toHaveBeenCalled();
  });

  it('removes the map language when the new protocol language has no labels', () => {
    const { rerender } = render(withProtocolLocale('hu'));

    rerender(withProtocolLocale('sw'));

    expect(mapInstance.setLanguage).toHaveBeenLastCalledWith(undefined);
    expect(MapConstructor).toHaveBeenCalledTimes(1);
  });

  it('does not touch the map when another protocol language maps to the same Mapbox language', () => {
    const { rerender } = render(withProtocolLocale('pt-BR'));
    expect(constructedWith().language).toBe('pt');

    rerender(withProtocolLocale('pt-PT'));

    expect(mapInstance.setLanguage).not.toHaveBeenCalled();
    expect(MapConstructor).toHaveBeenCalledTimes(1);
  });

  it('labels the map in Tagalog for a Filipino protocol language', () => {
    // A protocol's locales are canonical, so Tagalog arrives as `fil`; Mapbox
    // spells it `tl`.
    render(withProtocolLocale('fil'));

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

  it('stops highlighting a saved location once it can no longer be read', () => {
    const { rerender } = renderInEnglish(
      <TestHarness
        mapOptions={baseMapOptions}
        initialSelectionValue="tract-a"
      />,
    );
    act(() => {
      mapEvents.fire('load');
    });
    expect(mapInstance.setFilter).toHaveBeenLastCalledWith(
      ...highlights('tract-a'),
    );

    rerender(<TestHarness mapOptions={baseMapOptions} />);

    expect(mapInstance.setFilter).toHaveBeenLastCalledWith(...highlights(''));
  });

  it('follows the saved location while tiles are still loading', () => {
    // Mapbox reports its style as not loaded while any tile is loading.
    mapInstance.isStyleLoaded.mockReturnValue(false);
    const { rerender } = renderInEnglish(
      <TestHarness
        mapOptions={baseMapOptions}
        initialSelectionValue="tract-a"
      />,
    );
    act(() => {
      mapEvents.fire('load');
      mapEvents.fire('styledata');
    });
    expect(mapInstance.setFilter).toHaveBeenLastCalledWith(
      ...highlights('tract-a'),
    );

    rerender(<TestHarness mapOptions={baseMapOptions} />);
    expect(mapInstance.setFilter).toHaveBeenLastCalledWith(...highlights(''));

    act(() => {
      mapEvents.fire('styledata');
    });
    expect(mapInstance.setFilter).toHaveBeenLastCalledWith(...highlights(''));
  });

  it('highlights a picked area only once the pick is saved', () => {
    const onSelectionChange = vi.fn();
    const { rerender } = renderInEnglish(
      <TestHarness
        mapOptions={baseMapOptions}
        onSelectionChange={onSelectionChange}
      />,
    );
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

    expect(mapInstance.setFilter).toHaveBeenLastCalledWith(
      ...highlights('tract-b'),
    );
  });

  it('highlights the saved location again once the map is rebuilt', () => {
    const { rerender } = renderInEnglish(
      <TestHarness
        mapOptions={baseMapOptions}
        initialSelectionValue="tract-a"
      />,
    );
    act(() => {
      mapEvents.fire('load');
    });

    rerender(
      <TestHarness
        mapOptions={{ ...baseMapOptions, targetFeatureProperty: 'name' }}
        initialSelectionValue="tract-a"
      />,
    );
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
