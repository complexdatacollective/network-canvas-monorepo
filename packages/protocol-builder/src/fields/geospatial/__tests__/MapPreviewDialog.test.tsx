import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';

import { ResourceGatewayProvider } from '../../../resources/context.tsx';
import {
  resourceFailure,
  resourceOk,
  type ProtocolBuilderResourceGateway,
} from '../../../resources/gateway.ts';
import { InMemoryResourceGateway } from '../../../resources/InMemoryResourceGateway.ts';
import { overrideGateway } from '../../../resources/overrideGateway.ts';
import {
  emitMapEvent,
  expectMapboxMocked,
  mapControlsAdded,
  mapsBuilt,
  mapsRemoved,
  resetMapboxMock,
  setMapView,
} from '../../../testing/mapboxMock.ts';
import MapPreviewDialog from '../MapPreviewDialog.tsx';

/** The key's value, which must never reach the editor or the map. */
const SECRET = 'pk.this-value-must-never-leave-the-host';

/** What a host that can serve a credentialled style answers with. */
const HOSTED_STYLE = 'https://host.example/map-style/token-1?session=abc';

const releases: string[] = [];

const gatewayWith = (
  overrides: Partial<ProtocolBuilderResourceGateway> = {},
): ProtocolBuilderResourceGateway =>
  overrideGateway(
    new InMemoryResourceGateway({
      committed: [
        { kind: 'apikey', id: 'token-1', name: 'Mapbox key', value: SECRET },
      ],
    }),
    overrides,
  );

/**
 * A host that CAN draw a map for a stored key: it resolves the id to a style
 * URL it has credentialled on its own side. The in-memory gateway refuses
 * this on purpose (`unsupported-kind` for secret material), which is the other
 * case tested below.
 */
const servingGateway = () =>
  gatewayWith({
    resolvePreview: (resourceId) =>
      Promise.resolve(
        resourceId === 'token-1'
          ? resourceOk({
              resourceId,
              url: HOSTED_STYLE,
              release: () => releases.push(resourceId),
            })
          : resourceFailure('not-found', `no resource ${resourceId}`),
      ),
  });

const renderDialog = (
  gateway: ProtocolBuilderResourceGateway,
  props: Partial<Parameters<typeof MapPreviewDialog>[0]> = {},
) => {
  const onSave = vi.fn();
  const onClose = vi.fn();
  const view = render(
    <DialogProvider>
      <ResourceGatewayProvider gateway={gateway}>
        <MapPreviewDialog
          tokenAssetId="token-1"
          center={[-74, 40.7]}
          zoom={10}
          onSave={onSave}
          onClose={onClose}
          {...props}
        />
      </ResourceGatewayProvider>
    </DialogProvider>,
  );
  return { ...view, onSave, onClose, user: userEvent.setup() };
};

beforeEach(() => {
  resetMapboxMock();
  releases.length = 0;
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

  it('builds no map at all until a dialog asks for one', () => {
    expect(mapsBuilt()).toEqual([]);
  });
});

describe('setting the starting view on a map', () => {
  it('draws the style the host resolved for the stored key', async () => {
    renderDialog(servingGateway());

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
   * The gateway consumes secret material and hands back only an id, so there
   * is no path by which a key could reach the map. Asserted against everything
   * the map was built from, and against the page, because "we never pass it"
   * is exactly the kind of claim that stops being true quietly.
   */
  it('never hands the key itself to the map, or to the page', async () => {
    const { baseElement } = renderDialog(servingGateway());

    await waitFor(() => expect(mapsBuilt()).toHaveLength(1));
    const built = mapsBuilt()[0] ?? {};
    expect(Object.hasOwn(built, 'accessToken')).toBe(false);
    // Every option the map was given, except the DOM node it draws into.
    const { container: _container, ...options } = built;
    expect(JSON.stringify(options)).not.toContain(SECRET);
    expect(baseElement.innerHTML).not.toContain(SECRET);
  });

  it('offers the view only once the map is readable and has been moved', async () => {
    const { user, onSave, onClose } = renderDialog(servingGateway());
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

    await user.click(
      await screen.findByRole('button', { name: 'Use this view' }),
    );
    expect(onSave).toHaveBeenCalledWith([-0.12, 51.5], 12);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('releases the resolved style when the dialog goes away', async () => {
    const { unmount } = renderDialog(servingGateway());
    await waitFor(() => expect(mapsBuilt()).toHaveLength(1));

    unmount();

    expect(releases).toEqual(['token-1']);
    expect(mapsRemoved()).toBe(1);
  });

  it('says the map is unavailable, and builds none, when the host cannot serve one', async () => {
    // The in-memory gateway's own answer for secret material.
    renderDialog(gatewayWith());

    expect(
      await screen.findByText(/secret material cannot be previewed/i),
    ).toBeInTheDocument();
    expect(mapsBuilt()).toEqual([]);
  });

  it('asks for a key before a map, and builds none without one', async () => {
    renderDialog(servingGateway(), { tokenAssetId: undefined });

    expect(
      await screen.findByText(
        'Choose a Mapbox API key before setting the starting view on a map.',
      ),
    ).toBeInTheDocument();
    expect(mapsBuilt()).toEqual([]);
  });

  it('reports a map that failed to draw, without offering its view', async () => {
    renderDialog(servingGateway());
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
