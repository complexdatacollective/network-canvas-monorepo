import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import Field from '@codaco/fresco-ui/form/Field/Field';
import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { REQUIRED } from '../../form/requiredField.ts';
import { FieldStoryHost } from '../../testing/FieldStoryHost.tsx';
import type { InMemoryHost } from '../../testing/host/createInMemoryHost.ts';
import FeaturePropertyField from './FeaturePropertyField.tsx';
import type { GeoJsonPropertiesState } from './useGeoJsonFeatureProperties.ts';

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
 * A layer that was read, and what its features turned out to carry.
 *
 * The read is the SECTION's and arrives here as a prop, because the same answer
 * decides what this control offers and whether the save gate beside it refuses
 * what the stage holds. So a story states what the layer carries rather than
 * shipping a file for one — which is also how the states below reach the two
 * answers a fixture file cannot give, a document that is not GeoJSON and a host
 * with no bytes to serve.
 */
const layerCarrying = (...names: string[]): GeoJsonPropertiesState => ({
  names,
  busy: false,
  unreadable: false,
});

/** The layer the fixture's stage points at carries one property, `name`. */
const REGIONS = layerCarrying('name');

function PropertyPicker({
  dataSourceAssetId,
  properties,
}: Readonly<{
  dataSourceAssetId?: string;
  properties: GeoJsonPropertiesState;
}>) {
  return (
    <Field<typeof FeaturePropertyField>
      name="mapOptions.targetFeatureProperty"
      component={FeaturePropertyField}
      dataSourceAssetId={dataSourceAssetId}
      properties={properties}
      label="Recorded property"
      hint="The value of this property is what gets stored when a participant selects an area, so choose one that is filled in and unique for every feature — a census tract, a postcode, or a neighborhood name."
      required={REQUIRED}
    />
  );
}

const meta = {
  title: 'Protocol Builder/Fields/Geospatial/Recorded property',
  component: FieldStoryHost,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Chooses which property of a selected area is stored as the participant’s answer. The choices are read out of the chosen map layer itself, so a researcher can only record something the layer’s features actually carry — typing a name would let them record a field no feature has, and the interview would then store nothing for every area a participant chose. A property the stage already records is kept and named even when the current layer has no such property, and even when the layer could not be read at all: blanking it would hide the mismatch the researcher has to resolve and then save the blank over it.',
      },
    },
  },
  args: {
    stageId: 'geospatial-1',
    sectionTitle: 'Map layer',
    children: (
      <PropertyPicker dataSourceAssetId="geo_data" properties={REGIONS} />
    ),
  },
  tags: ['autodocs'],
} satisfies Meta<typeof FieldStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The stage as the protocol holds it: the layer's one property, recorded. */
export const Recording: Story = {};

/**
 * A layer chosen and nothing recorded yet — the state every new map stage
 * passes through. Whatever the control says here, it may not ask for a layer:
 * that one is answered.
 */
export const NothingRecordedYet: Story = {
  args: { seedEdit: withMapOptions({ targetFeatureProperty: undefined }) },
};

/**
 * Recording one of several. The three properties are this story's own reading
 * of the layer, for the same reason the list is read rather than typed: what is
 * on offer is a fact about the file, so the only way to show a choice being
 * made is to say what the file carries.
 */
export const ChoosingTheProperty: Story = {
  args: {
    seedEdit: withMapOptions({ targetFeatureProperty: undefined }),
    children: (
      <PropertyPicker
        dataSourceAssetId="geo_data"
        properties={layerCarrying('name', 'borough', 'postcode')}
      />
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The stage arrives from the host over a promise, so the editor — and
    // every control in it — is drawn a turn after the story mounts. Every play
    // in this file awaits its FIRST query for that reason.
    await awaitPassiveEffects();

    const picker = await canvas.findByRole('combobox', {
      name: 'Recorded property',
    });
    await userEvent.selectOptions(picker, 'borough');

    await expect(picker).toHaveValue('borough');
  },
};

/** Held elsewhere: the choice is there to read, and it cannot be changed. */
export const Spectating: Story = {
  args: { readOnly: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(
      await canvas.findByRole('combobox', { name: 'Recorded property' }),
    ).toBeDisabled();
  },
};

/**
 * The layer was swapped and no longer carries the property this stage records.
 *
 * The stale choice is kept, offered last so it does not sit among the
 * properties the layer really has, and named for what is wrong with it inside
 * the option itself — a plain dropdown option can carry no styling, so the
 * explanation has to be part of the label. Refusing the save belongs to the
 * section's own gate, which is why nothing here stops the researcher: this
 * control's job is to show them what they have to fix.
 */
export const APropertyTheLayerDoesNotHave: Story = {
  args: {
    children: (
      <PropertyPicker
        dataSourceAssetId="geo_data"
        properties={layerCarrying('borough')}
      />
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    const picker = await canvas.findByRole('combobox', {
      name: 'Recorded property',
    });
    await expect(picker).toHaveValue('name');
    await expect(
      within(picker).getByRole('option', {
        name: 'name — this property is not in the chosen layer',
      }),
    ).toBeInTheDocument();
  },
};

/**
 * No layer yet. Nothing is offered — not even the property the stage records,
 * which means nothing without a layer to read it from and would read as an
 * answer the researcher can keep.
 */
export const NoLayerChosen: Story = {
  args: {
    children: (
      <PropertyPicker properties={{ busy: false, unreadable: false }} />
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(
      await canvas.findByText(
        'Choose a map layer first. Its features are where these properties come from.',
      ),
    ).toBeInTheDocument();
    await expect(
      canvas.queryByRole('combobox', { name: 'Recorded property' }),
    ).toBeNull();
  },
};

/**
 * The file came back and is not GeoJSON this can read. Nothing will ever be
 * known about it, so the property the stage records stays on screen: it is the
 * reference the researcher has to act on, and a control that emptied itself
 * would save the blank over it.
 */
export const TheLayerCouldNotBeRead: Story = {
  args: {
    children: (
      <PropertyPicker
        dataSourceAssetId="geo_data"
        properties={{ busy: false, unreadable: true }}
      />
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(
      await canvas.findByText(
        'This layer could not be read as GeoJSON, so its properties cannot be listed.',
      ),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole('combobox', { name: 'Recorded property' }),
    ).toHaveValue('name');
  },
};

/**
 * The host could not serve the layer's bytes at all.
 *
 * Its own words are shown rather than a sentence made up here, and no retry is
 * offered: the contract marks a failure retryable when repeating the call might
 * still answer, and a resource this host has no bytes for is not one of them.
 */
export const AHostThatCannotServeTheLayer: Story = {
  args: {
    children: (
      <PropertyPicker
        dataSourceAssetId="geo_data"
        properties={{
          busy: false,
          unreadable: false,
          failure: {
            reason: 'not-found',
            message: 'this host holds no bytes for that resource',
            retryable: false,
          },
        }}
      />
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(
      await canvas.findByText('this host holds no bytes for that resource'),
    ).toBeInTheDocument();
    await expect(
      canvas.queryByRole('button', { name: 'Try reading the map layer again' }),
    ).toBeNull();
  },
};
