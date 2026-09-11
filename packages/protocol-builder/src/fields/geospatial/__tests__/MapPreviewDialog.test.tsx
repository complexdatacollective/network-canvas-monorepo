import { act, screen, waitFor } from '@testing-library/react';
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
  stylesApplied,
} from '../../../testing/mapboxMock.ts';
import { loadFixtureStage } from '../../../testing/protocolFixture.ts';
import {
  renderStageEditor,
  type StageEditorHarness,
} from '../../../testing/renderStageEditor.tsx';

/** The fixture's stored key, whose value must never reach the editor. */
const TOKEN_ASSET = 'mapbox_token';

/** The value behind it, which the asset manifest holds and this must not see. */
const SECRET =
  'pk.eyJ1IjoibmV0d29ya2NhbnZhcyIsImEiOiJjbXRqdnd4dnowY2M5MnlzZWNqYjNlZG5rIn0.KH3OS_O2Hk6gAbDjKGPAJg';

/** What a host that CAN serve a credentialled style answers with. */
const HOSTED_STYLE = 'https://host.example/map-style/mapbox_token?session=abc';

/**
 * Whether this test is running against a host that can draw a map, and what it
 * serves when it can.
 *
 * The package's own in-memory host deliberately cannot: the contract's
 * resource procedures consume secret material and never hand it back, so its
 * `preview` answers `unsupported-kind` for a key. That is the refusal path,
 * and it is exercised straight through the harness. A host that HAS built the
 * other side — resolving the stored id to a style it credentialled itself — is
 * the only way to reach everything past it, so exactly that one call is
 * replaced here, for exactly that one asset id. Every other resource call in
 * the editor is the real one.
 */
let servedStyle: string | undefined;

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
        const url = servedStyle;
        if (url === undefined) return client;
        return {
          ...client,
          resolvePreview: (resourceId: string) =>
            resourceId === TOKEN_ASSET
              ? Promise.resolve(resourceOk({ resourceId, url }))
              : client.resolvePreview(resourceId),
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
  servedStyle = undefined;
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
    servedStyle = HOSTED_STYLE;
    const harness = openEditor();
    await harness.opened();

    expect(mapsBuilt()).toEqual([]);
  });
});

describe('setting the starting view on a map', () => {
  it('draws the style the host resolved for the stored key', async () => {
    servedStyle = HOSTED_STYLE;
    const harness = openEditor();

    await openMap(harness);

    await waitFor(() => expect(mapsBuilt()).toHaveLength(1));
    expect(mapsBuilt()[0]).toMatchObject({
      style: HOSTED_STYLE,
      center: [-74, 40.7],
      zoom: 10,
    });
    // Zoom controls, so the view can be set without a scroll wheel.
    expect(mapControlsAdded()).toBe(1);
  });

  /**
   * And then shows the basemap the STAGE is set to.
   *
   * The framing is the whole purpose of this dialog, and a view framed on a
   * satellite basemap is a different decision from the same view framed on a
   * street map: labels, landmarks and coastlines are what a researcher aims
   * at. The host's URL is what credentials the map, and the researcher's own
   * choice is what it has to be showing — so the chosen style is swapped in as
   * soon as the credentialled one has loaded, which is what Architect achieves
   * by building its map with the chosen style and the key it holds.
   */
  it('shows the basemap the researcher chose, once the host map has loaded', async () => {
    servedStyle = HOSTED_STYLE;
    const harness = openEditor({
      style: 'mapbox://styles/mapbox/satellite-v9',
    });

    await openMap(harness);
    await waitFor(() => expect(mapsBuilt()).toHaveLength(1));
    expect(stylesApplied()).toEqual([]);

    act(() => emitMapEvent('load'));

    expect(stylesApplied()).toEqual(['mapbox://styles/mapbox/satellite-v9']);
  });

  /**
   * A stage with no basemap chosen is left on whatever the host resolved.
   * Swapping in nothing would leave the researcher framing a view on a map
   * that had gone blank.
   */
  it('leaves the host map alone when the stage names no basemap', async () => {
    servedStyle = HOSTED_STYLE;
    const harness = openEditor({ style: undefined });

    await openMap(harness);
    await waitFor(() => expect(mapsBuilt()).toHaveLength(1));
    act(() => emitMapEvent('load'));

    expect(stylesApplied()).toEqual([]);
  });

  /**
   * The contract's resource procedures consume secret material and hand back
   * only an id, so there is no path by which a key could reach the map.
   * Asserted against everything the map was built from, and against the page,
   * because "we never pass it" is exactly the kind of claim that stops being
   * true quietly.
   */
  it('never hands the key itself to the map, or to the page', async () => {
    servedStyle = HOSTED_STYLE;
    const harness = openEditor();

    await openMap(harness);

    await waitFor(() => expect(mapsBuilt()).toHaveLength(1));
    const built = mapsBuilt()[0] ?? {};
    expect(Object.hasOwn(built, 'accessToken')).toBe(false);
    // Every option the map was given, except the DOM node it draws into.
    const { container: _container, ...options } = built;
    expect(JSON.stringify(options)).not.toContain(SECRET);
    expect(document.body.innerHTML).not.toContain(SECRET);
  });

  it('offers the view only once the map is readable and has been moved', async () => {
    servedStyle = HOSTED_STYLE;
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
    servedStyle = HOSTED_STYLE;
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
    servedStyle = HOSTED_STYLE;
    const harness = openEditor();
    await openMap(harness);
    await waitFor(() => expect(mapsBuilt()).toHaveLength(1));

    await harness.user.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(mapsRemoved()).toBe(1));
  });

  /**
   * The package's own host, unmocked: it refuses to preview secret material,
   * which is the honest answer for a host that never hands a stored key back.
   * The researcher is told so and told what to do instead, and no map is
   * built.
   */
  it('says the map is unavailable, and builds none, when the host cannot serve one', async () => {
    const harness = openEditor();

    await openMap(harness);

    expect(
      await screen.findByText(/secret has no preview/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'This host cannot draw a map here, because it never hands an API key back once it has been stored. Type the coordinates instead.',
      ),
    ).toBeInTheDocument();
    expect(mapsBuilt()).toEqual([]);
  });

  it('asks for a key before a map, and builds none without one', async () => {
    servedStyle = HOSTED_STYLE;
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
    servedStyle = HOSTED_STYLE;
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
