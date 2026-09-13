import type { Meta, StoryObj } from '@storybook/react-vite';
import { type ReactNode, useEffect, useState } from 'react';
import { expect, screen, userEvent, waitFor, within } from 'storybook/test';

import Button from '@codaco/fresco-ui/Button';
import Field from '@codaco/fresco-ui/form/Field/Field';
import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import { REQUIRED } from '../../form/requiredField.ts';
import { useResourceClient } from '../../resources/client.tsx';
import { FieldStoryHost } from '../../testing/FieldStoryHost.tsx';
import MapCenterField from './MapCenterField.tsx';
import MapPreviewDialog from './MapPreviewDialog.tsx';

/** The fixture's stored Mapbox key, which this host will not resolve a map for. */
const KEY_ASSET = 'mapbox_token';

/**
 * The dialog, mounted the way `MapCenterField` mounts it, with a way back in.
 *
 * It is not a field, so it arrives through the host's `children` slot rather
 * than through `Field`, and it is rendered open because that is the only state
 * it has — `MapCenterField` mounts it on the click and unmounts it on the
 * close. The button is there so a reader who has closed it can open it again.
 *
 * What was accepted is written into a named status line: a dialog that
 * committed a view and one that was cancelled look identical once it has gone,
 * and a play function has to be able to tell them apart. Named, because the
 * host renders a live region of its own.
 */
function PreviewOn({
  tokenAssetId,
  style,
  center,
  zoom,
}: Readonly<{
  tokenAssetId: string | undefined;
  /** The basemap the stage names, swapped in once the host's map has loaded. */
  style?: string;
  center: unknown;
  zoom: unknown;
}>) {
  const [open, setOpen] = useState(true);
  const [accepted, setAccepted] = useState('Nothing accepted yet.');

  return (
    <div className="flex flex-col items-start gap-4">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
      >
        Set the starting view on a map
      </Button>
      <p role="status" aria-label="Accepted view">
        {accepted}
      </p>
      {open && (
        <MapPreviewDialog
          tokenAssetId={tokenAssetId}
          style={style}
          center={center}
          zoom={zoom}
          onSave={(nextCenter, nextZoom) => {
            setAccepted(
              `Accepted ${nextCenter[0]}, ${nextCenter[1]} at zoom ${nextZoom}.`,
            );
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

/**
 * A host that answers a stored id with a URL a preview can be drawn from.
 *
 * This package's own in-memory host cannot, and that refusal is a story of its
 * own below: the contract's resource procedures consume secret material and
 * hand back only an id, so `preview` of a key answers `unsupported-kind`. A
 * host that has built the other side — credentialling a style itself and
 * serving it for that id — is the only way to reach anything past that point,
 * and the one thing this host WILL hand back a URL for is a file it is holding
 * bytes for. So a file is staged and its id is passed as the key's.
 *
 * What the URL points at is immaterial and no story reaches Mapbox: the SDK is
 * replaced for the whole Storybook (`.storybook/mapboxMock.ts`), and the map it
 * builds draws a labelled placeholder instead of pretending to be a map. What
 * the staging buys is the state past the refusal — a map that reports it has
 * loaded, and a view that can be accepted.
 */
function WithAServedMap({
  children,
}: Readonly<{ children: (tokenAssetId: string) => ReactNode }>) {
  const resources = useResourceClient();
  const [assetId, setAssetId] = useState<string | undefined>(undefined);

  useEffect(() => {
    let live = true;
    void (async () => {
      const staged = await resources.stageUpload({
        // Stable across every run of this effect, so a remount stages one file
        // rather than another: the host answers a repeated request id with
        // what it staged the first time.
        requestId: 'story-served-map',
        kind: 'geojson',
        name: 'A file this host will serve a URL for',
        source: 'served-map.json',
        contentType: 'application/json',
        bytes: new TextEncoder().encode('{}'),
      });
      if (live && staged.status === 'ok') setAssetId(staged.data.id);
    })();
    return () => {
      live = false;
    };
  }, [resources]);

  return assetId === undefined ? null : children(assetId);
}

const meta = {
  title: 'Protocol Builder/Fields/Geospatial/Starting view on a map',
  component: FieldStoryHost,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Sets a stage’s starting view by panning and zooming a real map, for a researcher who knows the place but not its coordinates. The API key itself never reaches this dialog and cannot: the contract’s resource procedures consume secret material and hand back only an id, so the map is built from a style URL the host resolved for that id and credentialled on its own side. A host that will not do that says so, and the researcher sets the same two numbers by hand in the section behind the dialog — which is why those boxes are the control and this is the convenience. No story draws a real map: the Mapbox SDK is replaced for the whole Storybook, so no story reaches a live account.',
      },
    },
  },
  args: {
    stageId: 'geospatial-1',
    sectionTitle: 'Starting map view',
    children: (
      <WithAServedMap>
        {(tokenAssetId) => (
          <PreviewOn
            tokenAssetId={tokenAssetId}
            center={[-74, 40.7]}
            zoom={10}
          />
        )}
      </WithAServedMap>
    ),
  },
  tags: ['autodocs'],
} satisfies Meta<typeof FieldStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Opened on the view the stage already holds.
 *
 * Nothing is offered to accept, because nothing has moved: taking the view back
 * unchanged is not a decision, and a button that wrote the same pair again
 * would read as one.
 */
export const OpenedOnTheStagesView: Story = {
  play: async () => {
    // The stage arrives from the host over a promise, so the editor — and
    // every control in it — is drawn a turn after the story mounts. Every play
    // in this file awaits its FIRST query for that reason.
    await awaitPassiveEffects();

    // Portalled out of the story's own element, so it is looked for on the page.
    const dialog = await screen.findByRole('dialog');
    const map = await within(dialog).findByRole('region', {
      name: 'Interactive map',
    });
    // Waited out rather than asserted straight away: a map still drawing offers
    // no view either, so "nothing to accept" would be true for the wrong reason
    // and the assertion below would hold whether or not the rule does.
    await waitFor(async () => {
      await expect(map).toHaveAttribute('aria-busy', 'false');
    });
    await expect(
      within(dialog).queryByRole('button', { name: 'Use this view' }),
    ).toBeNull();
  },
};

/**
 * A stage that has never had a starting view.
 *
 * The view is offered as soon as the map is readable, so the researcher can
 * accept where it happens to be rather than having to nudge it first.
 */
export const NoStartingViewYet: Story = {
  args: {
    children: (
      <WithAServedMap>
        {(tokenAssetId) => (
          <PreviewOn
            tokenAssetId={tokenAssetId}
            center={undefined}
            zoom={undefined}
          />
        )}
      </WithAServedMap>
    ),
  },
};

/**
 * Taking the view.
 *
 * The map opens on the middle of the world because the stage names no centre,
 * and the replacement SDK never moves — it reports the view it was built at, so
 * what is accepted here is the view the map opened on. That the pair reaches
 * the caller at all is the whole of what this dialog is for: `MapCenterField`
 * writes the centre into its own field and the zoom into the one beside it.
 */
export const TakingTheView: Story = {
  args: {
    children: (
      <WithAServedMap>
        {(tokenAssetId) => (
          <PreviewOn
            tokenAssetId={tokenAssetId}
            center={undefined}
            zoom={undefined}
          />
        )}
      </WithAServedMap>
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    const dialog = await screen.findByRole('dialog');
    await userEvent.click(
      await within(dialog).findByRole('button', { name: 'Use this view' }),
    );

    await waitFor(async () => {
      await expect(
        canvas.getByRole('status', { name: 'Accepted view' }),
      ).toHaveTextContent('Accepted 0, 0 at zoom 0.');
    });
  },
};

/**
 * No key chosen yet, so there is nothing to draw a map from. Said as a warning
 * rather than as a failure: nothing went wrong, the researcher simply has a
 * control above this one still to answer.
 */
export const NoKeyChosenYet: Story = {
  args: {
    children: (
      <PreviewOn tokenAssetId={undefined} center={[-74, 40.7]} zoom={10} />
    ),
  },
  play: async () => {
    await awaitPassiveEffects();

    const dialog = await screen.findByRole('dialog');
    await expect(
      within(dialog).getByText(
        'Choose a Mapbox API key before setting the starting view on a map.',
      ),
    ).toBeInTheDocument();
    await expect(
      within(dialog).queryByRole('region', { name: 'Interactive map' }),
    ).toBeNull();
  },
};

/**
 * The refusal this package's own host gives: it never hands a stored key back,
 * so it can resolve no map for one. The only failure here that is not worth
 * retrying, which is why the dialog says what to do instead rather than
 * offering to ask again.
 */
export const TheHostWillNotResolveOne: Story = {
  args: {
    children: (
      <PreviewOn tokenAssetId={KEY_ASSET} center={[-74, 40.7]} zoom={10} />
    ),
  },
  play: async () => {
    await awaitPassiveEffects();

    const dialog = await screen.findByRole('dialog');
    await expect(
      await within(dialog).findByText(
        'This host cannot draw a map here, because it never hands an API key back once it has been stored. Type the coordinates instead.',
      ),
    ).toBeInTheDocument();
    await expect(
      within(dialog).queryByRole('region', { name: 'Interactive map' }),
    ).toBeNull();
  },
};

/**
 * What a spectator sees of this dialog, which is nothing.
 *
 * The dialog has no read-only state of its own: it takes no such prop, and the
 * only thing that opens it is the button `MapCenterField` renders, which an
 * editor held by somebody else disables. So the read-only state is shown where
 * it exists — at the door — with the field that owns it mounted here rather
 * than the dialog.
 */
export const NoWayInForASpectator: Story = {
  args: {
    readOnly: true,
    children: (
      <Field<typeof MapCenterField>
        name="mapOptions.center"
        component={MapCenterField}
        zoomFieldName="mapOptions.initialZoom"
        tokenAssetId={KEY_ASSET}
        label="Starting center"
        hint="Enter the coordinates, or set them by panning a map."
        required={REQUIRED}
      />
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(
      await canvas.findByRole('button', {
        name: 'Set the starting view on a map',
      }),
    ).toBeDisabled();
    await expect(screen.queryByRole('dialog')).toBeNull();
  },
};
