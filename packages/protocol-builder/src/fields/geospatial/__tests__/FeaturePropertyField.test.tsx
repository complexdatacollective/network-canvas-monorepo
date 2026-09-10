import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';

import {
  awaitLayerRead,
  geospatialSections,
  mapOptionsOf,
} from '../../../editors/geospatial/__tests__/geospatialFixtures.tsx';
import { loadFixtureStage } from '../../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';

/**
 * Two more layers beside the fixture's own.
 *
 * The harness serves the real bytes of a manifest entry whose `source` names a
 * file the fixture ships, and a `{}` placeholder for one it does not — which
 * is a document this cannot read as GeoJSON. An entry with no `source` at all
 * is one the host holds no bytes for, and says so.
 */
const EXTRA_LAYERS: Readonly<Record<string, SectionDoc>> = {
  unreadable_layer: {
    name: 'Unreadable layer',
    type: 'geojson',
    source: 'not-really-geojson.geojson',
  },
  absent_layer: { name: 'Absent layer', type: 'geojson' },
};

/**
 * The geospatial stage, with `mapOptions` changed by the caller.
 *
 * Built from the fixture rather than written out, so the stage under test
 * differs from the protocol's own in exactly the way the test names.
 */
const openWithMapOptions = (changes: Readonly<Record<string, unknown>>) => {
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
    assets: EXTRA_LAYERS,
  });
};

/**
 * The properties on offer, without the select's own "choose something"
 * placeholder — which is presentation, not a property of the layer.
 */
const offered = (picker: HTMLElement): string[] =>
  within(picker)
    .getAllByRole('option')
    .filter((option) => (option.getAttribute('value') ?? '') !== '')
    .map((option) => option.textContent ?? '');

describe('the property a map selection is recorded as', () => {
  it('offers the properties the chosen layer actually carries', async () => {
    renderStageEditor({
      stageId: 'geospatial-1',
      sections: geospatialSections,
      assets: EXTRA_LAYERS,
    });

    expect(offered(await awaitLayerRead())).toEqual(['name']);
  });

  it('reports the property the researcher chose', async () => {
    const harness = openWithMapOptions({});
    await awaitLayerRead();

    // The layer carries one property, so choosing it is choosing the one
    // thing on offer — which is still a choice the stage has to record.
    await harness.user.selectOptions(await awaitLayerRead(), 'name');

    const request = await harness.submit();
    expect(
      mapOptionsOf(request?.stageDocument ?? {}).targetFeatureProperty,
    ).toBe('name');
  });

  /**
   * Blanking a stale reference would hide the very mismatch the researcher has
   * to resolve, and would then save the blank over it.
   */
  it('keeps a stored property this layer does not have, and says so', async () => {
    openWithMapOptions({ targetFeatureProperty: 'postcode' });

    const picker = await awaitLayerRead();
    await waitFor(() =>
      expect(offered(picker)).toEqual([
        'name',
        'postcode — this property is not in the chosen layer',
      ]),
    );
    expect(
      screen.getByText(
        'This property is not in the chosen map layer. Choose one that is.',
      ),
    ).toBeInTheDocument();
  });

  it('asks for a layer before a property', async () => {
    openWithMapOptions({ dataSourceAssetId: undefined });

    expect(
      await screen.findByText(
        'Choose a map layer first. Its features are where these properties come from.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('combobox', { name: 'Recorded property' }),
    ).toBeNull();
  });

  /**
   * A layer that cannot be parsed says so, and the stage's own property stays
   * on screen: the reference is what the researcher has to act on, and a
   * control that had emptied itself would save the blank over it.
   */
  it('says when the layer cannot be read as GeoJSON, keeping what the stage records', async () => {
    openWithMapOptions({ dataSourceAssetId: 'unreadable_layer' });

    expect(
      await screen.findByText(
        'This layer could not be read as GeoJSON, so its properties cannot be listed.',
      ),
    ).toBeInTheDocument();
    const picker = screen.getByRole('combobox', { name: 'Recorded property' });
    expect(offered(picker)).toEqual(['name']);
    expect(picker).toHaveValue('name');
  });

  /**
   * A host that cannot serve the layer's bytes says so, and the stage's own
   * property stays on screen: the reference is what the researcher has to act
   * on, and a control that had emptied itself would save the blank over it.
   */
  it('reports a layer the host cannot serve, keeping what the stage records', async () => {
    openWithMapOptions({ dataSourceAssetId: 'absent_layer' });

    const picker = await awaitLayerRead();
    expect(offered(picker)).toEqual(['name']);
    expect(picker).toHaveValue('name');
    expect(
      await screen.findByText(/holds no bytes for that resource/i),
    ).toBeInTheDocument();
  });
});
