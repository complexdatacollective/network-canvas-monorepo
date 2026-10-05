import { act, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  geospatialSections,
  mapOptionsOf,
} from '../../../editors/geospatial/__tests__/geospatialFixtures.tsx';
import {
  emitMapEvent,
  expectMapboxMocked,
  mapControlsAdded,
  mapsBuilt,
  mapsRemoved,
  resetMapboxMock,
  setMapView,
} from '../../../testing/mapboxMock.ts';
import { loadFixtureStage } from '../../../testing/protocolFixture.ts';
import {
  renderStageEditor,
  type StageEditorHarness,
} from '../../../testing/renderStageEditor.tsx';

/** The fixture's stored key, which the map is drawn with. */
const TOKEN_ASSET = 'mapbox_token';

/**
 * The value the fixture protocol's asset manifest holds for it.
 *
 * The repository's one permitted Mapbox token (`TESTING_MAPBOX_TOKEN`, a
 * sandbox key restricted to the project's own domains); `check-mapbox-tokens`
 * allows no other anywhere in the tree. Written out here rather than imported
 * because it lives in Architect, which this package does not depend on — and
 * the fixture protocol is the oracle either way.
 */
const KEY_VALUE =
  'pk.eyJ1IjoibmV0d29ya2NhbnZhcyIsImEiOiJjbXRqdnd4dnowY2M5MnlzZWNqYjNlZG5rIn0.KH3OS_O2Hk6gAbDjKGPAJg';

/**
 * Whether this test replaces what the host answers for the key, and with what.
 *
 * The in-memory host reads the value out of the fixture protocol's own asset
 * manifest, which is what every host does — so nearly everything here runs
 * against the real client. The one state the fixture cannot produce is a
 * manifest entry holding no value at all, which is a hand-edited or truncated
 * protocol; exactly that one call is replaced for it.
 */
let keyWithoutAValue = false;

vi.mock('../../../resources/client.tsx', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../resources/client.tsx')>();
  const { useMemo } = await import('react');
  const { resourceOk } = await import('../../../resources/types.ts');
  return {
    ...actual,
    useResourceClient: () => {
      const client = actual.useResourceClient();
      // Held for the life of the edit, exactly as the real client is: a fresh
      // object every render would re-run every effect that reads a resource.
      // oxlint-disable-next-line react-hooks/rules-of-hooks
      return useMemo(() => {
        if (!keyWithoutAValue) return client;
        return {
          ...client,
          inspect: (resourceId: string) =>
            resourceId === TOKEN_ASSET
              ? Promise.resolve(
                  resourceOk({
                    descriptor: {
                      id: resourceId,
                      kind: 'apikey' as const,
                      name: 'Mapbox Token',
                      status: 'committed' as const,
                    },
                  }),
                )
              : client.inspect(resourceId),
        };
      }, [client]);
    },
  };
});

const openEditor = (
  changes: Readonly<Record<string, unknown>> = {},
): StageEditorHarness => {
  const { type, fields } = loadFixtureStage('geospatial-1');
  const options =
    typeof fields.mapOptions === 'object' && fields.mapOptions !== null
      ? fields.mapOptions
      : {};
  return renderStageEditor({
    stage: {
      type,
      fields: { ...fields, mapOptions: { ...options, ...changes } },
    },
    sections: geospatialSections,
  });
};

/** Opens the starting-view dialog the way a researcher does. */
const openMap = async (harness: StageEditorHarness): Promise<void> => {
  await harness.user.click(
    screen.getByRole('button', { name: 'Set the starting view on a map' }),
  );
  await screen.findByRole('dialog');
};

beforeEach(() => {
  resetMapboxMock();
  keyWithoutAValue = false;
});

describe('the Mapbox SDK this suite runs against', () => {
  /**
   * The guard the whole file rests on. A real Mapbox map fetches a style,
   * tiles, sprites and fonts from Mapbox's servers — billed requests against a
   * live account, from a suite that runs on every push — and needs a WebGL
   * context jsdom does not have.
   */
  it('is the mock, not the real one', async () => {
    await expectMapboxMocked();
  });

  it('builds no map at all until a dialog asks for one', async () => {
    const harness = openEditor();
    await harness.opened();

    expect(mapsBuilt()).toEqual([]);
  });
});

describe('setting the starting view on a map', () => {
  /**
   * The map is the participant's map: the chosen key's own value and the
   * basemap the stage is configured to show, which is the pair Architect built
   * its map from and the pair the interview runtime builds the participant's
   * from. The framing is the whole purpose of this dialog, and a view framed on
   * a satellite basemap is a different decision from the same view framed on a
   * street map — so it has to be the right basemap from the first frame.
   */
  it('builds the map with the chosen key and the basemap the stage shows', async () => {
    const harness = openEditor({
      style: 'mapbox://styles/mapbox/satellite-v9',
    });

    await openMap(harness);

    await waitFor(() => expect(mapsBuilt()).toHaveLength(1));
    expect(mapsBuilt()[0]).toMatchObject({
      accessToken: KEY_VALUE,
      style: 'mapbox://styles/mapbox/satellite-v9',
      center: [-74, 40.7],
      zoom: 10,
    });
    // Zoom controls, so the view can be set without a scroll wheel.
    expect(mapControlsAdded()).toBe(1);
  });

  /**
   * A stage with no basemap chosen is drawn on Mapbox's own street map, which
   * is what Architect's dialog did and what the schema's default resolves to.
   */
  it('falls back to the street map when the stage names no basemap', async () => {
    const harness = openEditor({ style: undefined });

    await openMap(harness);

    await waitFor(() => expect(mapsBuilt()).toHaveLength(1));
    expect(mapsBuilt()[0]).toMatchObject({
      accessToken: KEY_VALUE,
      style: 'mapbox://styles/mapbox/streets-v12',
    });
  });

  /**
   * The value goes to the map constructor and nowhere a reader can see it.
   * Asserted against the page because "it only reaches the SDK" is exactly the
   * kind of claim that stops being true quietly.
   */
  it('puts the key in the map and nowhere on the page', async () => {
    const harness = openEditor();

    await openMap(harness);

    await waitFor(() => expect(mapsBuilt()).toHaveLength(1));
    expect(mapsBuilt()[0]?.accessToken).toBe(KEY_VALUE);
    expect(document.body.innerHTML).not.toContain(KEY_VALUE);
  });

  it('offers the view only once the map is readable and has been moved', async () => {
    const harness = openEditor();
    await openMap(harness);
    await waitFor(() => expect(mapsBuilt()).toHaveLength(1));

    // Still loading: nothing to accept yet.
    expect(screen.queryByRole('button', { name: 'Use this view' })).toBeNull();

    act(() => emitMapEvent('load'));
    // Loaded, but sitting exactly where the stage already opens.
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Use this view' }),
      ).toBeNull(),
    );

    setMapView({ lng: -0.12, lat: 51.5 }, 12);
    act(() => emitMapEvent('move'));

    await harness.user.click(
      await screen.findByRole('button', { name: 'Use this view' }),
    );

    // Accepted INTO the stage, which is the whole point of the dialog: the
    // pair the researcher panned to is what the stage now opens on, and the
    // zoom travelled with it.
    const request = await harness.submit();
    expect(mapOptionsOf(request?.stageDocument ?? {})).toMatchObject({
      center: [-0.12, 51.5],
      initialZoom: 12,
    });
  });

  /**
   * The view a researcher pans east across the antimeridian to.
   *
   * Mapbox counts longitude as they keep going — its own `LngLat#wrap`
   * documents 286.0251 as the place -73.9749 names — and this dialog is the
   * one place that number becomes a value the stage holds. Taken as it came,
   * the accepted view is a centre the section's own control refuses, so the
   * researcher would be sent to type by hand the coordinates of the place
   * they had just pointed at.
   */
  it('accepts a view panned past the antimeridian as a place the stage can save', async () => {
    const harness = openEditor();
    await openMap(harness);
    await waitFor(() => expect(mapsBuilt()).toHaveLength(1));
    act(() => emitMapEvent('load'));

    setMapView({ lng: 286.0251, lat: 40.7736 }, 12);
    act(() => emitMapEvent('move'));

    await harness.user.click(
      await screen.findByRole('button', { name: 'Use this view' }),
    );

    const request = await harness.submit();
    expect(request).not.toBeNull();
    const center = mapOptionsOf(request?.stageDocument ?? {}).center;
    const [longitude, latitude] = Array.isArray(center) ? center : [];
    expect(longitude).toBeCloseTo(-73.9749, 10);
    expect(latitude).toBe(40.7736);
    expect(mapOptionsOf(request?.stageDocument ?? {}).initialZoom).toBe(12);
  });

  it('tears the map down when the dialog is closed', async () => {
    const harness = openEditor();
    await openMap(harness);
    await waitFor(() => expect(mapsBuilt()).toHaveLength(1));

    await harness.user.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(mapsRemoved()).toBe(1));
  });

  /**
   * A protocol whose manifest entry for the key holds no value — hand-edited,
   * or truncated on the way in. There is nothing to draw a map with, so the
   * researcher is told that and sent to the coordinate boxes behind the
   * dialog, exactly as released Architect did for an unavailable key.
   */
  it('says the key could not be read, and builds no map, when the protocol holds no value for it', async () => {
    keyWithoutAValue = true;
    const harness = openEditor();

    await openMap(harness);

    expect(
      await screen.findByText(
        'The map could not be drawn because the chosen API key could not be read. Choose a different key, or type the coordinates instead.',
      ),
    ).toBeInTheDocument();
    expect(mapsBuilt()).toEqual([]);
  });

  /**
   * A stage still naming a key the protocol no longer holds. Said inside the
   * dialog, in the host's own words: the picker behind it reports the same
   * absence, and a researcher who opened the map has to read it here.
   */
  it('reports a key the protocol no longer has, and builds no map', async () => {
    const harness = openEditor({ tokenAssetId: 'a-key-that-is-gone' });

    await openMap(harness);

    const dialog = within(await screen.findByRole('dialog'));
    expect(await dialog.findByText(/no such resource/i)).toBeInTheDocument();
    expect(mapsBuilt()).toEqual([]);
  });

  it('asks for a key before a map, and builds none without one', async () => {
    const harness = openEditor({ tokenAssetId: undefined });

    await openMap(harness);

    expect(
      await screen.findByText(
        'Choose a Mapbox API key before setting the starting view on a map.',
      ),
    ).toBeInTheDocument();
    expect(mapsBuilt()).toEqual([]);
  });

  it('reports a map that failed to draw, without offering its view', async () => {
    const harness = openEditor();
    await openMap(harness);
    await waitFor(() => expect(mapsBuilt()).toHaveLength(1));

    act(() => emitMapEvent('error'));

    expect(
      await screen.findByText(
        'The map could not be drawn. Check that the API key is still valid, then try again.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Use this view' })).toBeNull();
  });
});
