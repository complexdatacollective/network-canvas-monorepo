import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, screen, userEvent, within } from 'storybook/test';

import Field from '@codaco/fresco-ui/form/Field/Field';
import { messageRuleValidation } from '@codaco/fresco-ui/form/validation/helpers';
import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { REQUIRED } from '../../form/requiredField.ts';
import { FieldStoryHost } from '../../testing/FieldStoryHost.tsx';
import type { InMemoryHost } from '../../testing/host/createInMemoryHost.ts';
import { centerIssue } from './mapView.ts';
import MapViewField from './MapViewField.tsx';

const GEOSPATIAL = sectionId({ kind: 'stage', stageId: 'geospatial-1' });

/** The fixture's geospatial stage with its map settings changed. */
const withMapOptions =
  (changes: Readonly<Record<string, unknown>>) => (host: InMemoryHost) => {
    const { document } = host.store.read(GEOSPATIAL);
    const mapOptions =
      typeof document.mapOptions === 'object' && document.mapOptions !== null
        ? document.mapOptions
        : {};
    host.store.applyAsCollaborator(GEOSPATIAL, {
      ...document,
      mapOptions: { ...mapOptions, ...changes },
    });
  };

/**
 * The starting view, mounted as `MapAppearanceSection` mounts it.
 *
 * `centerIssue` travels with the control rather than being restated: the same
 * rule decides what the section refuses, and a story that left it off would be
 * showing a control that accepts coordinates the researcher's stage cannot
 * save. The zoom's own rule travels inside the control, with the registration
 * it belongs to.
 */
function InitialMapView() {
  return (
    <Field<typeof MapViewField>
      name="mapOptions.center"
      component={MapViewField}
      zoomFieldName="mapOptions.initialZoom"
      tokenAssetId="mapbox_token"
      label="Initial map view"
      hint="Configure the initial map view to adjust where it will be centered and zoomed to."
      required={REQUIRED}
      custom={messageRuleValidation([centerIssue])}
    />
  );
}

const meta = {
  title: 'Protocol Builder/Fields/Geospatial/Initial map view',
  component: FieldStoryHost,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The view the map opens on: where it is centred, and how far in. One decision and therefore one control, as released Architect asked it — three numbers and a map, inside one group. Architect offered the map alone; the typed boxes are the only way to set an exact view, and they keep working where no map can be drawn at all, so they stay. What is shown is the researcher’s own text and what is stored is the numbers it reads as, because a number input reports nothing for a reading it cannot parse: rendered from the stored number, the minus sign of a western longitude would vanish under the cursor as soon as the first digit landed on it.',
      },
    },
  },
  args: {
    stageId: 'geospatial-1',
    sectionTitle: 'Starting map view',
    children: <InitialMapView />,
  },
  tags: ['autodocs'],
} satisfies Meta<typeof FieldStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The stage as the protocol holds it: the map opens on New York. */
export const Centred: Story = {};

/** All three numbers, in one group, with the map beside them. */
export const TheWholeView: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The stage arrives from the host over a promise, so the editor — and
    // every control in it — is drawn a turn after the story mounts. Every play
    // in this file awaits its FIRST query for that reason.
    await awaitPassiveEffects();

    await expect(await canvas.findByLabelText('Longitude')).toHaveValue(-74);
    await expect(canvas.getByLabelText('Latitude')).toHaveValue(40.7);
    await expect(
      canvas.getByRole('spinbutton', { name: 'Starting zoom' }),
    ).toHaveValue(10);
  },
};

/** A zoom the schema refuses, reported against the group that holds it. */
export const AZoomOutOfRange: Story = {
  args: { seedEdit: withMapOptions({ initialZoom: 30 }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await userEvent.click(
      await canvas.findByRole('button', { name: 'Save stage' }),
    );

    await expect(
      await canvas.findByText('Starting zoom must be between 0 and 22.'),
    ).toBeInTheDocument();
  },
};

/** A stage with no starting view yet, so the map opens where the interface does. */
export const NoCentreChosen: Story = {
  args: { seedEdit: withMapOptions({ center: undefined }) },
};

/**
 * Building a western longitude out of the characters typed into it.
 *
 * The reading passes through `-`, `-1`, `-12` on its way, and a number input
 * reports none of those: this is the case the field exists for.
 */
export const TypingACoordinate: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    const longitude = await canvas.findByLabelText('Longitude');
    await userEvent.clear(longitude);
    await userEvent.type(longitude, '-122.4');

    await expect(longitude).toHaveValue(-122.4);
    // The other half is one value with it, and typing one must not disturb it.
    await expect(canvas.getByLabelText('Latitude')).toHaveValue(40.7);
  },
};

/**
 * Half a pair is not a centre.
 *
 * Emptying one box is how a researcher says they have not chosen a starting
 * view after all, so the save is refused rather than the missing coordinate
 * being stood in for — zero is a real place, the Gulf of Guinea, and a stage
 * saved with one would open somewhere nobody chose with nothing having said so.
 * The coordinate they did enter stays in front of them to finish.
 */
export const OneCoordinateLeftBlank: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await userEvent.clear(await canvas.findByLabelText('Longitude'));
    await userEvent.click(canvas.getByRole('button', { name: 'Save stage' }));

    await expect(
      await canvas.findByText('This field is required.'),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole('status', { name: 'Save status' }),
    ).toHaveTextContent('Nothing saved yet.');
    await expect(canvas.getByLabelText('Latitude')).toHaveValue(40.7);
  },
};

/**
 * Held elsewhere: the coordinates are there to read, and the way onto a map is
 * shut. A spectator never reaches the preview dialog, which is why that dialog
 * has no read-only state of its own.
 */
export const Spectating: Story = {
  args: { readOnly: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(await canvas.findByLabelText('Longitude')).toBeDisabled();
    await expect(
      canvas.getByRole('button', { name: 'Set the starting view on a map' }),
    ).toBeDisabled();
  },
};

/**
 * The other way in, opened: a map drawn from the stage's own key and basemap,
 * which the researcher pans and zooms to the view the participant will open
 * on. The typed boxes behind it stay the control; the dialog's own stories
 * cover what it shows in every other state.
 */
export const OpeningTheMap: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await userEvent.click(
      await canvas.findByRole('button', {
        name: 'Set the starting view on a map',
      }),
    );

    // The dialog is portalled out of the story's own element, so it is looked
    // for on the page rather than in the canvas.
    const dialog = await screen.findByRole('dialog');
    await expect(
      await within(dialog).findByRole('region', { name: 'Interactive map' }),
    ).toBeInTheDocument();
  },
};
