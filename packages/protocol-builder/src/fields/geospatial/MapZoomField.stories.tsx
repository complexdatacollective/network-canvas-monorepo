import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import Field from '@codaco/fresco-ui/form/Field/Field';
import { messageRuleValidation } from '@codaco/fresco-ui/form/validation/helpers';
import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { REQUIRED } from '../../form/requiredField.ts';
import { FieldStoryHost } from '../../testing/FieldStoryHost.tsx';
import type { InMemoryHost } from '../../testing/host/createInMemoryHost.ts';
import { MAX_ZOOM, MIN_ZOOM, zoomIssue } from './mapView.ts';
import MapZoomField from './MapZoomField.tsx';

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
 * The zoom, mounted as `MapAppearanceSection` mounts it.
 *
 * `zoomIssue` travels with the control rather than being restated: it is the
 * same range the protocol schema enforces, said under the control the
 * researcher typed into instead of against a path once a save has already been
 * refused.
 */
function StartingZoom() {
  return (
    <Field<typeof MapZoomField>
      name="mapOptions.initialZoom"
      component={MapZoomField}
      label="Starting zoom"
      hint={`${MIN_ZOOM} shows the whole world; ${MAX_ZOOM} is street level.`}
      required={REQUIRED}
      custom={messageRuleValidation([zoomIssue])}
    />
  );
}

const meta = {
  title: 'Protocol Builder/Fields/Geospatial/Starting zoom',
  component: FieldStoryHost,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'How far the map is zoomed in when the stage opens, on Mapbox’s own scale — 0 shows the whole world and 22 is street level. A number, held as a number: a text control reports what was typed, and a string is not a zoom level to the protocol schema, so the reading is parsed here rather than at each place that stores one. Text that is not a number at all clears the value instead of storing one that means nothing, which is how the field says “not answered”. Its steppers are named for the number they move, because three numbers describe one starting view and six buttons all called “Increase value” cannot be told apart by anyone navigating by name.',
      },
    },
  },
  args: {
    stageId: 'geospatial-1',
    sectionTitle: 'Starting map view',
    children: <StartingZoom />,
  },
  tags: ['autodocs'],
} satisfies Meta<typeof FieldStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The stage as the protocol holds it: zoomed in on a city. */
export const Chosen: Story = {};

/** A stage with no starting zoom yet. */
export const NotChosenYet: Story = {
  args: { seedEdit: withMapOptions({ initialZoom: undefined }) },
};

/**
 * Stepping the zoom.
 *
 * The stepper is asserted by the name this field gives it rather than by its
 * position: that name is the whole reason the field passes its own, and a play
 * that found the button some other way would pass with the shared "Increase
 * value" back on it.
 */
export const SteppingTheZoom: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The stage arrives from the host over a promise, so the editor — and
    // every control in it — is drawn a turn after the story mounts. Every play
    // in this file awaits its FIRST query for that reason.
    await awaitPassiveEffects();

    await userEvent.click(
      await canvas.findByRole('button', { name: 'Increase zoom' }),
    );

    await expect(
      canvas.getByRole('spinbutton', { name: 'Starting zoom' }),
    ).toHaveValue(11);
  },
};

/**
 * A zoom Mapbox has no such thing as.
 *
 * Reported under the control rather than left to the schema, which says the
 * same thing about a path after the save has already been refused.
 */
export const AZoomOutsideTheScale: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    const zoom = await canvas.findByRole('spinbutton', {
      name: 'Starting zoom',
    });
    await userEvent.clear(zoom);
    await userEvent.type(zoom, '30');
    await userEvent.click(canvas.getByRole('button', { name: 'Save stage' }));

    await expect(
      await canvas.findByText('Starting zoom must be between 0 and 22.'),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole('status', { name: 'Save status' }),
    ).toHaveTextContent('Nothing saved yet.');
  },
};

/** Held elsewhere: the zoom is there to read, and neither stepper will move it. */
export const Spectating: Story = {
  args: { readOnly: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(
      await canvas.findByRole('spinbutton', { name: 'Starting zoom' }),
    ).toBeDisabled();
    await expect(
      canvas.getByRole('button', { name: 'Increase zoom' }),
    ).toBeDisabled();
  },
};
