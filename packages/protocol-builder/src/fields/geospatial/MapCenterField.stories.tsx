import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, screen, userEvent, within } from 'storybook/test';

import Field from '@codaco/fresco-ui/form/Field/Field';
import { messageRuleValidation } from '@codaco/fresco-ui/form/validation/helpers';
import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { REQUIRED } from '../../form/requiredField.ts';
import { FieldStoryHost } from '../../testing/FieldStoryHost.tsx';
import type { InMemoryHost } from '../../testing/host/createInMemoryHost.ts';
import MapCenterField from './MapCenterField.tsx';
import { centerIssue } from './mapView.ts';

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
 * The centre, mounted as `MapAppearanceSection` mounts it.
 *
 * `centerIssue` travels with the control rather than being restated: the same
 * rule decides what the section refuses, and a story that left it off would be
 * showing a control that accepts coordinates the researcher's stage cannot
 * save. The zoom it names is a real path in the stage document even though no
 * zoom control is mounted here — a view the researcher sets on a map writes
 * both halves, and the form holds the whole stage, not only what is on screen.
 */
function StartingCenter() {
  return (
    <Field<typeof MapCenterField>
      name="mapOptions.center"
      component={MapCenterField}
      zoomFieldName="mapOptions.initialZoom"
      tokenAssetId="mapbox_token"
      label="Starting center"
      hint="Enter the coordinates, or set them by panning a map. Longitude runs from -180 to 180, latitude from -90 to 90."
      required={REQUIRED}
      custom={messageRuleValidation([centerIssue])}
    />
  );
}

const meta = {
  title: 'Protocol Builder/Fields/Geospatial/Starting center',
  component: FieldStoryHost,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Where the map is centred when the stage opens: two numbers, editable as two numbers, and settable by panning a map for a researcher who knows the place but not its coordinates. The typed boxes are the control and the map is the convenience — they are the only way to set an exact centre, and they keep working where no map can be drawn at all. What is shown is the researcher’s own text and what is stored is the pair of numbers it reads as, because a number input reports nothing for a reading it cannot parse: rendered from the stored number, the minus sign of a western longitude would vanish under the cursor as soon as the first digit landed on it.',
      },
    },
  },
  args: {
    stageId: 'geospatial-1',
    sectionTitle: 'Starting map view',
    children: <StartingCenter />,
  },
  tags: ['autodocs'],
} satisfies Meta<typeof FieldStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The stage as the protocol holds it: the map opens on New York. */
export const Centred: Story = {};

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
    // The stage arrives from the host over a promise, so the editor — and
    // every control in it — is drawn a turn after the story mounts. Every play
    // in this file awaits its FIRST query for that reason.
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
 * The other way in, opened.
 *
 * This host will not resolve a map for a stored key — the contract's resource
 * procedures consume secret material and hand back only an id — so the dialog
 * says so and the researcher types the coordinates in the boxes behind it,
 * which is exactly why those boxes are the control. The dialog's own stories
 * cover what a host that CAN serve one shows.
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
    // Awaited: the dialog opens saying how to pan a map, and only says this
    // once the host has answered that it will not resolve one.
    await expect(
      await within(dialog).findByText(
        'This host cannot draw a map here, because it never hands an API key back once it has been stored. Type the coordinates instead.',
      ),
    ).toBeInTheDocument();
  },
};
