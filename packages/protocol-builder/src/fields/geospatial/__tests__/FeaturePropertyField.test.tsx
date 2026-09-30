import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';

import {
  awaitLayerRead,
  geospatialSections,
  mapOptionsOf,
} from '../../../editors/geospatial/__tests__/geospatialFixtures.tsx';
import { loadFixtureStage } from '../../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';

/**
 * The layer whose read is held open, and the handle that lets it answer.
 *
 * A read in flight is a state every other case in this file waits out, so it
 * cannot be observed by timing: the harness's host answers immediately. Held
 * here instead, for exactly the one asset a test names, so the editor sits in
 * the state a researcher passes through every time they choose a layer — and
 * nothing else about the host changes.
 */
let heldLayer: string | undefined;
let releaseHeldLayer: (() => void) | undefined;

vi.mock('../../../resources/client.tsx', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../resources/client.tsx')>();
  const { useMemo } = await import('react');
  return {
    ...actual,
    useResourceClient: () => {
      const client = actual.useResourceClient();
      // Held for the life of the edit, exactly as the real client is: a fresh
      // object every render would re-run every effect that reads a resource.
      // oxlint-disable-next-line react-hooks/rules-of-hooks
      return useMemo(() => {
        const held = heldLayer;
        if (held === undefined) return client;
        return {
          ...client,
          resolvePreview: async (resourceId: string) => {
            if (resourceId !== held) return client.resolvePreview(resourceId);
            await new Promise<void>((resolve) => {
              releaseHeldLayer = resolve;
            });
            return client.resolvePreview(resourceId);
          },
        };
      }, [client]);
    },
  };
});

afterEach(() => {
  heldLayer = undefined;
  releaseHeldLayer?.();
  releaseHeldLayer = undefined;
});

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
  bare_layer: {
    name: 'Unlabelled layer',
    type: 'geojson',
    source: 'bare.geojson',
  },
  boroughs_layer: {
    name: 'Boroughs',
    type: 'geojson',
    source: 'boroughs.geojson',
  },
};

/** Files the protocol does not ship, for the two states one of its own cannot reach. */
const EXTRA_BYTES: Readonly<Record<string, string>> = {
  'bare.geojson': JSON.stringify({
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: null }],
  }),
  'boroughs.geojson': JSON.stringify({
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { borough: 'Queens' }, geometry: null },
    ],
  }),
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
    assetBytes: EXTRA_BYTES,
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
      assetBytes: EXTRA_BYTES,
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
  it('keeps a stored property this layer does not have, and marks it', async () => {
    openWithMapOptions({ targetFeatureProperty: 'postcode' });

    const picker = await awaitLayerRead();
    await waitFor(() =>
      expect(offered(picker)).toEqual([
        'name',
        'postcode — this property is not in the chosen layer',
      ]),
    );
  });

  /**
   * Both halves of the pairing are on this stage, so the mismatch is refused
   * rather than reported: an interview run against a stage recording a
   * property its layer does not carry stores nothing for every area the
   * participant chooses, and nothing downstream reads the layer's bytes to
   * say so.
   *
   * The layer is SWAPPED under a property the stage already records, which is
   * the move that breaks the pair — and the researcher has both controls in
   * front of them.
   */
  it('refuses to save a property the newly chosen layer does not carry', async () => {
    const harness = openWithMapOptions({ targetFeatureProperty: 'name' });
    await awaitLayerRead();

    await harness.user.click(
      screen.getByRole('button', { name: 'Change the map layer' }),
    );
    await harness.user.click(
      await within(await screen.findByRole('dialog')).findByRole('button', {
        name: 'Boroughs',
      }),
    );
    await waitFor(() =>
      expect(
        offered(
          screen.getByRole('combobox', { name: 'Map selection property' }),
        ),
      ).toEqual(['borough', 'name — this property is not in the chosen layer']),
    );

    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByText(
        'This property is not in the chosen map layer. Choose one that is.',
      ),
    ).toBeInTheDocument();

    // And the way out is the one the refusal names, in the same dialog.
    await harness.user.selectOptions(
      screen.getByRole('combobox', { name: 'Map selection property' }),
      'borough',
    );

    const request = await harness.submit();
    expect(mapOptionsOf(request?.stageDocument ?? {})).toMatchObject({
      dataSourceAssetId: 'boroughs_layer',
      targetFeatureProperty: 'borough',
    });
  });

  /**
   * The window the gate would otherwise be walked straight through: the read
   * of the newly chosen layer is still in flight, so nothing yet contradicts
   * the property the stage holds — and a save taken now commits exactly the
   * mismatched pair the gate exists to stop. "Not known yet" is not "cannot be
   * known": the answer is coming, so the save waits for it and says so.
   */
  it('does not save a property it cannot check while the layer is still being read', async () => {
    heldLayer = 'boroughs_layer';
    const harness = openWithMapOptions({
      dataSourceAssetId: 'boroughs_layer',
      targetFeatureProperty: 'name',
    });
    await harness.opened();

    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByText(
        'The map layer is still being read, so this property cannot be checked against it yet. Save again in a moment.',
      ),
    ).toBeInTheDocument();

    // And once the layer answers, the refusal is the one the pair earns: this
    // is `boroughs.geojson`, which carries no `name`.
    releaseHeldLayer?.();
    await waitFor(() =>
      expect(
        offered(
          screen.getByRole('combobox', { name: 'Map selection property' }),
        ),
      ).toEqual(['borough', 'name — this property is not in the chosen layer']),
    );
    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByText(
        'This property is not in the chosen map layer. Choose one that is.',
      ),
    ).toBeInTheDocument();
  });

  /**
   * The one thing a gate over a file must not do: refuse on knowledge it does
   * not have. A layer that could not be read says nothing about whether the
   * property the stage records is in it, so the stage still saves — the same
   * rule the roster editors keep for an inspection that will not come.
   */
  it('does not refuse a stored property when the layer cannot be read', async () => {
    const harness = openWithMapOptions({
      dataSourceAssetId: 'unreadable_layer',
      targetFeatureProperty: 'postcode',
    });

    expect(
      await screen.findByText(
        'This layer could not be read as GeoJSON, so its properties cannot be listed.',
      ),
    ).toBeInTheDocument();

    const request = await harness.submit();
    expect(
      mapOptionsOf(request?.stageDocument ?? {}).targetFeatureProperty,
    ).toBe('postcode');
  });

  it('asks for a layer before a property', async () => {
    openWithMapOptions({ dataSourceAssetId: undefined });

    expect(
      await screen.findByText(
        'Choose a map layer first. Its features are where these properties come from.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('combobox', { name: 'Map selection property' }),
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
    const picker = screen.getByRole('combobox', {
      name: 'Map selection property',
    });
    expect(offered(picker)).toEqual(['name']);
    expect(picker).toHaveValue('name');
  });

  it('says when the layer’s features carry nothing to record', async () => {
    openWithMapOptions({
      dataSourceAssetId: 'bare_layer',
      targetFeatureProperty: undefined,
    });

    expect(
      await screen.findByText(
        'The features in this layer carry no properties, so there is nothing to record a selection as. Choose a layer whose features are labeled.',
      ),
    ).toBeInTheDocument();
  });

  /**
   * Not "the old properties until the new layer arrives": those belong to a
   * layer this stage no longer uses, and offering one is offering an answer
   * the researcher can keep. Asserted against a layer the host cannot serve,
   * so the state the previous layer's properties would survive into is one
   * that settles rather than one the next read closes over.
   */
  it('drops the previous layer’s properties as soon as another is chosen', async () => {
    const harness = openWithMapOptions({ targetFeatureProperty: undefined });
    const picker = await awaitLayerRead();
    await waitFor(() => expect(offered(picker)).toEqual(['name']));

    await harness.user.click(
      screen.getByRole('button', { name: 'Change the map layer' }),
    );
    await harness.user.click(
      await within(await screen.findByRole('dialog')).findByRole('button', {
        name: 'Absent layer',
      }),
    );

    expect(
      await screen.findByText(/holds no bytes for that resource/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('combobox', { name: 'Map selection property' }),
    ).toBeNull();
  });

  /**
   * The one state a new stage passes through every time: a layer has been
   * chosen and nothing is recorded yet. Whatever the control says here, it may
   * not say the layer is missing — that sends the researcher back to a control
   * they have already answered, and contradicts the failure beside it.
   */
  it('does not ask for a layer that has already been chosen', async () => {
    openWithMapOptions({
      dataSourceAssetId: 'absent_layer',
      targetFeatureProperty: undefined,
    });

    expect(
      await screen.findByText(/holds no bytes for that resource/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        'Choose a map layer first. Its features are where these properties come from.',
      ),
    ).toBeNull();
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
