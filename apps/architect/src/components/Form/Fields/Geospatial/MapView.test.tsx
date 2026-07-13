import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mapboxMocks = vi.hoisted(() => {
  const handlers = new Map<string, () => void>();
  const mapInstance = {
    addControl: vi.fn(),
    getCenter: vi.fn(),
    getZoom: vi.fn(),
    on: vi.fn(),
    remove: vi.fn(),
  };
  const MapConstructor = vi.fn(function MapMock() {
    return mapInstance;
  });
  const NavigationControl = vi.fn(function NavigationControlMock() {
    return {};
  });

  return { handlers, mapInstance, MapConstructor, NavigationControl };
});

vi.mock('mapbox-gl/esm', () => ({
  Map: mapboxMocks.MapConstructor,
  NavigationControl: mapboxMocks.NavigationControl,
}));

vi.mock('react-redux', () => ({
  useSelector: () => ({
    'token-asset': { value: 'test-access-token' },
  }),
}));

import MapView, { hasMapViewChanged, type MapOptions } from './MapView';

const mapOptions: MapOptions = {
  center: [12, 34],
  initialZoom: 6,
  tokenAssetId: 'token-asset',
  style: 'mapbox://styles/mapbox/streets-v12',
};

let animationFrames: FrameRequestCallback[];

const flushAnimationFrames = () => {
  const callbacks = animationFrames;
  animationFrames = [];
  act(() => {
    callbacks.forEach((callback) => callback(performance.now()));
  });
};

const getMapHandler = (eventName: string) => {
  const handler = mapboxMocks.handlers.get(eventName);
  expect(handler).toBeTypeOf('function');
  return handler as () => void;
};

describe('MapView', () => {
  beforeEach(() => {
    animationFrames = [];
    mapboxMocks.handlers.clear();
    mapboxMocks.mapInstance.addControl.mockReset();
    mapboxMocks.mapInstance.getCenter.mockReset();
    mapboxMocks.mapInstance.getZoom.mockReset();
    mapboxMocks.mapInstance.on.mockReset();
    mapboxMocks.mapInstance.on.mockImplementation(
      (eventName: string, handler: () => void) => {
        mapboxMocks.handlers.set(eventName, handler);
        return mapboxMocks.mapInstance;
      },
    );
    mapboxMocks.mapInstance.remove.mockReset();
    mapboxMocks.MapConstructor.mockReset();
    mapboxMocks.MapConstructor.mockImplementation(function MapMock() {
      return mapboxMocks.mapInstance;
    });
    mapboxMocks.NavigationControl.mockReset();
    mapboxMocks.NavigationControl.mockImplementation(
      function NavigationControlMock() {
        return {};
      },
    );
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        animationFrames.push(callback);
        return animationFrames.length;
      }),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('compares the center by coordinate values', () => {
    expect(hasMapViewChanged([12, 34], 6, mapOptions)).toBe(false);
    expect(hasMapViewChanged([13, 34], 6, mapOptions)).toBe(true);
    expect(hasMapViewChanged([12, 34], 7, mapOptions)).toBe(true);
    expect(
      hasMapViewChanged([0, 0], 0, { center: [0, 0], initialZoom: 0 }),
    ).toBe(false);
    expect(hasMapViewChanged([0, 0], 0, { initialZoom: 0 })).toBe(true);
    expect(
      hasMapViewChanged([0, 0], 0, {
        center: [Number.NaN, 0],
        initialZoom: 0,
      }),
    ).toBe(true);
  });

  it.each([
    ['missing', undefined],
    ['invalid', [Number.NaN, 0]],
  ])(
    'lets the loaded default view be saved when the persisted center is %s',
    async (_description, initialCenter) => {
      const onChange = vi.fn();
      const close = vi.fn();
      const partialMapOptions: MapOptions = {
        tokenAssetId: 'token-asset',
        initialZoom: 0,
        style: 'mapbox://styles/mapbox/streets-v12',
        ...(initialCenter ? { center: initialCenter } : {}),
      };

      render(
        <MapView
          mapOptions={partialMapOptions}
          onChange={onChange}
          close={close}
        />,
      );

      expect(
        screen.queryByRole('button', { name: 'Save Changes' }),
      ).not.toBeInTheDocument();

      await waitFor(() => expect(animationFrames.length).toBeGreaterThan(0));
      flushAnimationFrames();
      act(() => getMapHandler('load')());

      fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

      expect(onChange).toHaveBeenCalledWith({
        ...partialMapOptions,
        center: [0, 0],
        initialZoom: 0,
      });
      expect(close).toHaveBeenCalledTimes(1);
    },
  );

  it('does not offer to save an unchanged configured zero-valued view', async () => {
    render(
      <MapView
        mapOptions={{
          center: [0, 0],
          initialZoom: 0,
          tokenAssetId: 'token-asset',
        }}
        onChange={vi.fn()}
        close={vi.fn()}
      />,
    );

    await waitFor(() => expect(animationFrames.length).toBeGreaterThan(0));
    flushAnimationFrames();
    act(() => getMapHandler('load')());

    expect(
      screen.queryByRole('button', { name: 'Save Changes' }),
    ).not.toBeInTheDocument();
  });

  it('saves a changed, loaded view and closes the editor', async () => {
    const onChange = vi.fn();
    const close = vi.fn();
    mapboxMocks.mapInstance.getCenter.mockReturnValue({ lng: 13, lat: 35 });
    mapboxMocks.mapInstance.getZoom.mockReturnValue(7);

    render(
      <MapView mapOptions={mapOptions} onChange={onChange} close={close} />,
    );

    expect(
      screen.getByRole('region', { name: 'Interactive map preview' }),
    ).toHaveAttribute('aria-busy', 'true');
    expect(
      screen.queryByRole('button', { name: 'Save Changes' }),
    ).not.toBeInTheDocument();

    await waitFor(() => expect(animationFrames.length).toBeGreaterThan(0));
    flushAnimationFrames();
    act(() => getMapHandler('load')());

    expect(
      screen.getByRole('region', { name: 'Interactive map preview' }),
    ).toHaveAttribute('aria-busy', 'false');
    expect(
      screen.queryByRole('button', { name: 'Save Changes' }),
    ).not.toBeInTheDocument();

    act(() => getMapHandler('move')());
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(onChange).toHaveBeenCalledWith({
      ...mapOptions,
      center: [13, 35],
      initialZoom: 7,
    });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('cancels without saving', async () => {
    const onChange = vi.fn();
    const close = vi.fn();

    render(
      <MapView mapOptions={mapOptions} onChange={onChange} close={close} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onChange).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('announces runtime map errors and prevents saving', async () => {
    const onChange = vi.fn();
    mapboxMocks.mapInstance.getCenter.mockReturnValue({ lng: 13, lat: 35 });
    mapboxMocks.mapInstance.getZoom.mockReturnValue(7);

    render(
      <MapView mapOptions={mapOptions} onChange={onChange} close={vi.fn()} />,
    );

    await waitFor(() => expect(animationFrames.length).toBeGreaterThan(0));
    flushAnimationFrames();
    act(() => getMapHandler('load')());
    act(() => getMapHandler('move')());
    expect(
      screen.getByRole('button', { name: 'Save Changes' }),
    ).toBeInTheDocument();

    act(() => getMapHandler('error')());

    expect(screen.getByRole('alert')).toHaveTextContent(
      'The map preview could not be loaded.',
    );
    expect(
      screen.queryByRole('button', { name: 'Save Changes' }),
    ).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('announces synchronous map initialization errors', async () => {
    mapboxMocks.MapConstructor.mockImplementationOnce(function MapMock() {
      throw new Error('Map initialization failed');
    });

    render(
      <MapView mapOptions={mapOptions} onChange={vi.fn()} close={vi.fn()} />,
    );

    await waitFor(() => expect(animationFrames.length).toBeGreaterThan(0));
    flushAnimationFrames();

    expect(screen.getByRole('alert')).toHaveTextContent(
      'The map preview could not be loaded.',
    );
  });
});
