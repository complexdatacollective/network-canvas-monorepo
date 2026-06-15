import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// --- Module mocks (must appear before imports that use them) ---

// Minimal Mapbox Map stub. `load` never fires in jsdom, so the layer/source
// setup attached to it is never invoked — only the resize/remove surface and
// the event registration matter here. Hoisted so the (hoisted) vi.mock factory
// can reference it.
const { mapInstance, MapConstructor } = vi.hoisted(() => {
  const instance = {
    on: vi.fn(),
    resize: vi.fn(),
    remove: vi.fn(),
  };
  // A regular (non-arrow) function so it can be invoked with `new`.
  return {
    mapInstance: instance,
    MapConstructor: vi.fn(function MapMock() {
      return instance;
    }),
  };
});

vi.mock('mapbox-gl', () => ({
  default: { Map: MapConstructor, accessToken: '' },
}));

vi.mock('~/contract/context', () => ({
  useContractFlags: () => ({ isE2E: false }),
}));

vi.mock('~/selectors/protocol', () => ({
  // `useSelector(makeGetApiKeyAssetValue)` resolves to the
  // `(tokenAssetId) => value` reader the hook then calls.
  makeGetApiKeyAssetValue: () => () => 'test-access-token',
}));

vi.mock('react-redux', () => ({
  useSelector: (selector: (state: unknown) => unknown) => selector({}),
}));

// The hook under test (imported after mocks are declared)
import { type ExtendedMapOptions, useMapbox } from '../useMapbox';

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
  color: 'primary-color-seq-1',
  targetFeatureProperty: 'id',
  style: 'mapbox://styles/mapbox/streets-v12',
  showTransit: false,
} as unknown as ExtendedMapOptions;

function TestHarness({ mapOptions }: { mapOptions: ExtendedMapOptions }) {
  const { mapContainerRef } = useMapbox({
    mapOptions,
    dataSourceAssetId: null,
    dataSourceUrl: null,
    onSelectionChange: () => {
      // no-op: not exercised by these tests
    },
  });
  return <div data-testid="map" ref={mapContainerRef} />;
}

beforeEach(() => {
  observerInstances = [];
  rafCallbacks = [];
  mapInstance.on.mockClear();
  mapInstance.resize.mockClear();
  mapInstance.remove.mockClear();
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

describe('useMapbox resize handling', () => {
  it('observes the map container once the map is initialised', () => {
    render(<TestHarness mapOptions={baseMapOptions} />);

    expect(MapConstructor).toHaveBeenCalledTimes(1);
    expect(observerInstances).toHaveLength(1);
    expect(observerInstances[0]!.observeSpy).toHaveBeenCalled();
  });

  it('resizes the map (on the next frame) when the container resizes', () => {
    render(<TestHarness mapOptions={baseMapOptions} />);

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
    render(<TestHarness mapOptions={baseMapOptions} />);

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
    const { unmount } = render(<TestHarness mapOptions={baseMapOptions} />);

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
