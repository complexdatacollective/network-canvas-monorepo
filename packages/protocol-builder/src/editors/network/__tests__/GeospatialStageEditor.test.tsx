import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  expectMapboxMocked,
  mapsBuilt,
  resetMapboxMock,
} from '../../../fields/geospatial/__tests__/mapboxMock.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import { GeospatialStageEditor } from '../GeospatialStageEditor.tsx';
import {
  deleteNodeVariable,
  expectAttributedTo,
  removeAsset,
} from './collaboratorChanges.ts';
import { harnessEditor } from './editorFixtures.tsx';

/**
 * The map SDK is replaced for this whole file. Mounting this editor pulls the
 * starting-view preview — and therefore `mapbox-gl` — into the module graph,
 * and a real Mapbox map would fetch a style, tiles, sprites and fonts from
 * Mapbox's servers as billed requests against a live account.
 */
vi.mock('mapbox-gl/esm', async () => {
  const { createMapboxMock } =
    await import('../../../fields/geospatial/__tests__/mapboxMock.ts');
  return createMapboxMock();
});

const TOKEN_ASSET = 'mapbox_token';
const LAYER_ASSET = 'geo_data';

beforeEach(() => {
  resetMapboxMock();
});

const geospatialEditor = harnessEditor(GeospatialStageEditor, 'Geospatial');

const openFixture = () =>
  renderStageEditor({ stageId: 'geospatial-1', editor: geospatialEditor });

describe('the geospatial stage editor', () => {
  it('runs against a mocked Mapbox SDK, and builds no map by mounting', async () => {
    await expectMapboxMocked();
    openFixture();

    await screen.findByRole('button', { name: 'Change the API key' });
    expect(mapsBuilt()).toEqual([]);
  });

  it('saves the stage it opened, unchanged', async () => {
    const harness = openFixture();

    await harness.roundTrip({ unowned: [] });
  });

  /**
   * The map is four decisions a researcher makes at different times, each
   * finishable on its own, so each of them appears in the outline separately.
   */
  it('composes its sections in the order the decisions are made', async () => {
    const harness = openFixture();

    await waitFor(() => expect(harness.outline()).toHaveLength(10));
    expect(harness.outline().map((section) => section.title)).toEqual([
      'Stage name',
      'Node type',
      'Stage filter',
      'Map access',
      'Map layer',
      'Map appearance',
      'Starting map view',
      'Prompts',
      'Skip logic',
      'Interviewer guidance',
    ]);
  });

  it('refuses a starting view the map cannot show, and says where', async () => {
    const harness = openFixture();

    const zoom = screen.getByRole('spinbutton', { name: 'Starting zoom' });
    await harness.user.clear(zoom);
    await harness.user.type(zoom, '30');

    expect(await harness.submit()).toBeNull();
    expect(
      harness
        .outline()
        .filter((section) => section.state === 'Has a problem')
        .map((section) => section.title),
    ).toEqual(['Starting map view']);
  });

  it('leaves nothing pending, and nothing imported, when the edit is abandoned', async () => {
    const harness = openFixture();

    await harness.user.click(
      screen.getByRole('switch', { name: 'Allow searching the map' }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Change the map layer' }),
    );
    await harness.user.upload(
      await screen.findByLabelText('Choose a file from your computer'),
      new File(
        ['{"type":"FeatureCollection","features":[]}'],
        'areas.geojson',
        {
          type: 'application/geo+json',
        },
      ),
    );
    await waitFor(() =>
      expect(harness.session.getSnapshot().stagedResources).not.toHaveLength(0),
    );

    await harness.cancel();

    expect(harness.pendingCommands()).toEqual([]);
    expect(harness.session.getSnapshot().stagedResources).toEqual([]);
    expect(harness.gateway.getStagingResidue()).toEqual([]);
  });

  /**
   * Every prompt records its answer in one location attribute of the codebook.
   * A collaborator deleting that attribute breaks the prompt, and the editor
   * has to say so — and say whose change it was — without writing anything of
   * its own.
   */
  it('reports the deletion of the attribute its prompts record, and who made it', async () => {
    const harness = openFixture();
    const dispatch = vi.spyOn(harness.session, 'dispatch');
    await waitFor(() =>
      expect(harness.session.getSnapshot().validation.status).toBe('valid'),
    );

    deleteNodeVariable(harness, 'person', 'location');

    await waitFor(() =>
      expect(harness.session.getSnapshot().validation.status).toBe('invalid'),
    );
    expectAttributedTo(harness, 'variable');
    expect(dispatch).not.toHaveBeenCalled();
    expect(harness.pendingCommands()).toEqual([]);
  });

  it('reports a map layer a collaborator removed, and who removed it', async () => {
    const harness = openFixture();
    await waitFor(() =>
      expect(harness.session.getSnapshot().validation.status).toBe('valid'),
    );

    removeAsset(harness, LAYER_ASSET);

    await waitFor(() =>
      expect(harness.session.getSnapshot().validation.status).toBe('invalid'),
    );
    expectAttributedTo(harness, 'dataSourceAssetId');
    // The removal is theirs, so it leaves nothing of ours outstanding.
    expect(harness.pendingCommands()).toEqual([]);
    expect(await harness.submit()).toBeNull();
  });

  it('reports an API key a collaborator removed, and who removed it', async () => {
    const harness = openFixture();
    await waitFor(() =>
      expect(harness.session.getSnapshot().validation.status).toBe('valid'),
    );

    removeAsset(harness, TOKEN_ASSET);

    await waitFor(() =>
      expect(harness.session.getSnapshot().validation.status).toBe('invalid'),
    );
    expectAttributedTo(harness, 'tokenAssetId');
    expect(harness.pendingCommands()).toEqual([]);
  });

  it('refuses to save while somebody else holds the stage', async () => {
    const harness = openFixture();
    harness.setReadOnly();

    expect(
      screen.getByRole('switch', { name: 'Allow searching the map' }),
    ).toBeDisabled();
    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByText(/read-only/, { exact: false }),
    ).toBeInTheDocument();
    expect(harness.pendingCommands()).toEqual([]);
  });
});
