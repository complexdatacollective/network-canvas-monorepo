import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useState } from 'react';
import { expect, screen, userEvent, waitFor, within } from 'storybook/test';

import Button from '@codaco/fresco-ui/Button';
import { useDialogSession } from '@codaco/fresco-ui/dialogs/useDialogSession';
import Field from '@codaco/fresco-ui/form/Field/Field';
import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import { REQUIRED } from '../../form/requiredField.ts';
import { FieldStoryHost } from '../../testing/FieldStoryHost.tsx';
import MapPreviewDialog from './MapPreviewDialog.tsx';
import MapViewField from './MapViewField.tsx';

/** The fixture's stored Mapbox key, which the map below is drawn with. */
const KEY_ASSET = 'mapbox_token';

/** An id the fixture protocol has no resource for, so the host refuses it. */
const MISSING_KEY_ASSET = 'a-key-this-protocol-no-longer-has';

/**
 * The dialog, mounted the way `MapViewField` mounts it, with a way back in.
 *
 * It is not a field, so it arrives through the host's `children` slot rather
 * than through `Field`, and it is rendered open because that is the only state
 * it has — `MapViewField` mounts it on the click and unmounts it on the
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
  /** The basemap the stage names, which the map is built on. */
  style?: string;
  center: unknown;
  zoom: unknown;
}>) {
  // As a host uses it: the session outlives the close, so the dialog animates
  // out instead of vanishing.
  const {
    session: map,
    openSession: openMap,
    closeSession: closeMap,
    onSessionExited: mapExited,
  } = useDialogSession<Record<string, never>>();
  useEffect(() => openMap({}), []);
  const [accepted, setAccepted] = useState('Nothing accepted yet.');

  return (
    <div className="flex flex-col items-start gap-4">
      <Button
        type="button"
        color="default"
        size="sm"
        onClick={() => openMap({})}
      >
        Set the starting view on a map
      </Button>
      <p role="status" aria-label="Accepted view">
        {accepted}
      </p>
      {map !== null && (
        <MapPreviewDialog
          open={map.open}
          onExitComplete={mapExited}
          tokenAssetId={tokenAssetId}
          style={style}
          center={center}
          zoom={zoom}
          onSave={(nextCenter, nextZoom) => {
            setAccepted(
              `Accepted ${nextCenter[0]}, ${nextCenter[1]} at zoom ${nextZoom}.`,
            );
          }}
          onClose={closeMap}
        />
      )}
    </div>
  );
}

const meta = {
  title: 'Protocol Builder/Fields/Geospatial/Starting view on a map',
  component: FieldStoryHost,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Sets a stage’s starting view by panning and zooming a real map, for a researcher who knows the place but not its coordinates. The map is built from the chosen API key’s own value and the basemap the stage is configured to show, which is the pair the participant’s map is built from — so the view is framed on the map the participant will see. The typed coordinate boxes in the section behind the dialog stay the control, and this is the convenience. No story draws a real map: the Mapbox SDK is replaced for the whole Storybook, so no story reaches a live account.',
      },
    },
  },
  args: {
    stageId: 'geospatial-1',
    sectionTitle: 'Starting map view',
    children: (
      <PreviewOn tokenAssetId={KEY_ASSET} center={[-74, 40.7]} zoom={10} />
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
      <PreviewOn tokenAssetId={KEY_ASSET} center={undefined} zoom={undefined} />
    ),
  },
};

/**
 * Taking the view.
 *
 * The map opens on the middle of the world because the stage names no centre,
 * and the replacement SDK never moves — it reports the view it was built at, so
 * what is accepted here is the view the map opened on. That the pair reaches
 * the caller at all is the whole of what this dialog is for: `MapViewField`
 * writes the centre into its own field and the zoom into the one beside it.
 */
export const TakingTheView: Story = {
  args: {
    children: (
      <PreviewOn tokenAssetId={KEY_ASSET} center={undefined} zoom={undefined} />
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
 * A stage still naming a key the protocol no longer holds — deleted from the
 * resource library while this stage kept pointing at it. The host says so in
 * its own words and no map is drawn; the coordinate boxes behind the dialog
 * are still there.
 */
export const TheKeyIsNoLongerInTheProtocol: Story = {
  args: {
    children: (
      <PreviewOn
        tokenAssetId={MISSING_KEY_ASSET}
        center={[-74, 40.7]}
        zoom={10}
      />
    ),
  },
  play: async () => {
    await awaitPassiveEffects();

    const dialog = await screen.findByRole('dialog');
    await expect(
      await within(dialog).findByText(/no such resource/i),
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
 * only thing that opens it is the button `MapViewField` renders, which an
 * editor held by somebody else disables. So the read-only state is shown where
 * it exists — at the door — with the field that owns it mounted here rather
 * than the dialog.
 */
export const NoWayInForASpectator: Story = {
  args: {
    readOnly: true,
    children: (
      <Field<typeof MapViewField>
        name="mapOptions.center"
        component={MapViewField}
        zoomFieldName="mapOptions.initialZoom"
        tokenAssetId={KEY_ASSET}
        label="Initial map view"
        hint="Configure the initial map view to adjust where it will be centered and zoomed to."
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
