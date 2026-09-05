import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import {
  expectMapboxMocked,
  mapsBuilt,
  resetMapboxMock,
} from '../../../testing/mapboxMock.ts';
import {
  renderStageEditor,
  type StageEditorHarness,
} from '../../../testing/renderStageEditor.tsx';
import StageNameSection from '../../StageNameSection.tsx';
import GeospatialPromptsSection from '../GeospatialPromptsSection.tsx';
import MapAppearanceSection from '../MapAppearanceSection.tsx';
import MapSourceSection from '../MapSourceSection.tsx';

const ASSETS_SECTION = sectionId({ kind: 'assets' });

/**
 * What the protocol schema itself says about a reference whose asset is gone.
 * Spelled out here so a change to it fails this test rather than quietly
 * leaving the researcher without an explanation.
 */
const MISSING_LAYER_MESSAGE =
  'Geospatial dataSourceAssetId "geo_data" does not reference an asset in the manifest.';
const PERSON_SECTION = sectionId({ kind: 'codebookNode', typeId: 'person' });

const openEditor = () =>
  renderStageEditor({
    stageId: 'geospatial-1',
    sections: (
      <>
        <StageNameSection />
        <MapSourceSection />
        <GeospatialPromptsSection />
        <MapAppearanceSection />
      </>
    ),
  });

const mapOptions = (
  stage: Record<string, unknown>,
): Record<string, unknown> => {
  const options = stage.mapOptions;
  if (typeof options !== 'object' || options === null) {
    throw new Error('the saved stage has no map options');
  }
  return options as Record<string, unknown>;
};

/** Applies a change to the authoritative asset manifest, as a collaborator. */
function receiveManifest(
  harness: StageEditorHarness,
  change: (manifest: Record<string, unknown>) => void,
): void {
  const sections = harness.session.getSnapshot().protocolSections;
  const manifest = { ...sections[ASSETS_SECTION] };
  change(manifest);
  act(() => {
    harness.session.receiveAuthoritativeUpdate({
      protocolSections: { ...sections, [ASSETS_SECTION]: manifest },
      manifestRevision: { sequence: 2n, hash: 'revision-2' },
    });
  });
}

/**
 * Replaces one coordinate, whole.
 *
 * Set rather than typed, because these tests are about what the section does
 * with a finished coordinate. What the control does with a coordinate as it is
 * being built — where a lone minus sign reads as no number at all — belongs to
 * the field, and `fields/geospatial/__tests__/MapCenterField.test.tsx` types
 * one in character by character.
 */
function enterCoordinate(label: string, value: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

/** The problems the session's own validation currently reports. */
const validationIssues = (harness: StageEditorHarness) =>
  harness.session.getSnapshot().validation.issues;

describe('the map a geospatial stage shows', () => {
  it('runs against a mocked Mapbox SDK, and builds no map by mounting', async () => {
    resetMapboxMock();
    await expectMapboxMocked();
    openEditor();

    await screen.findByRole('button', { name: 'Change the API key' });
    expect(mapsBuilt()).toEqual([]);
  });

  it('saves the stage it opened, unchanged', async () => {
    const harness = openEditor();

    // The type the stage places on the map belongs to a section this mount
    // does not include.
    await harness.roundTrip({ unowned: ['subject'] });
  });

  /**
   * Four decisions a researcher makes at different times, each finishable on
   * its own, so the outline reports on each of them separately.
   */
  it('reports each map decision separately', async () => {
    const harness = openEditor();

    await waitFor(() => expect(harness.outline()).toHaveLength(6));
    expect(harness.outline().map((entry) => entry.title)).toEqual([
      'Stage name',
      'Map access',
      'Map layer',
      'Prompts',
      'Map appearance',
      'Starting map view',
    ]);
  });

  /**
   * A key and a layer are stored resources. The field holds an asset id and
   * nothing else — there is no file field and no URL field for either, which
   * is what keeps a key out of the protocol document and off this screen.
   */
  it('takes the key and the layer from the resource picker, and nothing else', async () => {
    openEditor();

    expect(
      await screen.findByRole('button', { name: 'Change the API key' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Change the map layer' }),
    ).toBeInTheDocument();
    // Exactly two resources are chosen here, and both through a picker.
    expect(
      screen
        .getAllByRole('button')
        .map((button) => button.textContent ?? '')
        .filter((label) => /^(Change|Select) the/.test(label)),
    ).toHaveLength(2);
    expect(screen.queryByRole('textbox', { name: /API key/i })).toBeNull();
    expect(screen.queryByRole('textbox', { name: /map layer/i })).toBeNull();
    // The manifest holds a value for the fixture's key. It is the host's, and
    // it must not be anywhere on this screen.
    expect(document.body.innerHTML).not.toContain('pk.eyJ1');
  });

  it('saves a different basemap, transit, and starting zoom', async () => {
    const harness = openEditor();

    await harness.user.selectOptions(
      screen.getByRole('combobox', { name: 'Basemap' }),
      'mapbox://styles/mapbox/dark-v11',
    );
    await harness.user.click(
      screen.getByRole('switch', { name: 'Show public transport' }),
    );
    const zoom = screen.getByRole('spinbutton', { name: 'Starting zoom' });
    await harness.user.clear(zoom);
    await harness.user.type(zoom, '14');

    const request = await harness.submit();
    expect(request).not.toBeNull();
    expect(mapOptions(request?.stageDocument ?? {})).toMatchObject({
      style: 'mapbox://styles/mapbox/dark-v11',
      showTransit: true,
      initialZoom: 14,
      // Untouched keys of the same object survive: a section owning part of a
      // nested value renders all of it.
      tokenAssetId: 'mapbox_token',
      dataSourceAssetId: 'geo_data',
      targetFeatureProperty: 'name',
    });
  });

  it('saves a starting centre entered as two coordinates', async () => {
    const harness = openEditor();

    enterCoordinate('Longitude', '-0.12');
    enterCoordinate('Latitude', '51.5');

    const request = await harness.submit();
    expect(mapOptions(request?.stageDocument ?? {}).center).toEqual([
      -0.12, 51.5,
    ]);
  });

  it('refuses a centre outside the world', async () => {
    const harness = openEditor();

    enterCoordinate('Longitude', '999');

    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByText('Longitude must be between -180 and 180.'),
    ).toBeInTheDocument();
  });

  it('refuses a zoom the map cannot show', async () => {
    const harness = openEditor();

    const zoom = screen.getByRole('spinbutton', { name: 'Starting zoom' });
    await harness.user.clear(zoom);
    await harness.user.type(zoom, '30');

    expect(await harness.submit()).toBeNull();
  });
});

describe('a map resource a collaborator removes', () => {
  /**
   * The reference stays in the stage, so the stage is now unsaveable. The
   * problem is reported against the stage's own section and names the
   * resource, so the researcher is told what to put back rather than that
   * something is wrong.
   */
  it('is reported against this stage, naming the resource', async () => {
    const harness = openEditor();
    await waitFor(() =>
      expect(harness.session.getSnapshot().validation.status).toBe('valid'),
    );

    receiveManifest(harness, (manifest) => {
      delete manifest.geo_data;
    });

    await waitFor(() =>
      expect(harness.session.getSnapshot().validation.status).toBe('invalid'),
    );
    expect(validationIssues(harness)).toContainEqual(
      expect.objectContaining({
        message: MISSING_LAYER_MESSAGE,
        sectionId: sectionId({ kind: 'stage', stageId: 'geospatial-1' }),
        path: expect.arrayContaining(['mapOptions', 'dataSourceAssetId']),
      }),
    );
  });

  it('refuses the save, and tells the researcher which resource is gone', async () => {
    const harness = openEditor();
    receiveManifest(harness, (manifest) => {
      delete manifest.geo_data;
    });
    await waitFor(() =>
      expect(harness.session.getSnapshot().validation.status).toBe('invalid'),
    );

    expect(await harness.submit()).toBeNull();
    // Said in both of the places a researcher could be looking: the outline
    // names the section that refused, and the section itself spells the
    // problem out. Nothing on the map options field can explain a reference to
    // a resource that is not in the manifest, so the outline carries the
    // session's own words.
    const outline = screen.getByRole('navigation', { name: 'Stage sections' });
    expect(
      within(outline).getByText(MISSING_LAYER_MESSAGE, { exact: false }),
    ).toBeInTheDocument();
    expect(
      screen
        .getAllByText(MISSING_LAYER_MESSAGE, { exact: false })
        .filter((element) => !outline.contains(element)),
    ).toHaveLength(1);
  });

  it('reports a removed key against the field that holds it', async () => {
    const harness = openEditor();
    await waitFor(() =>
      expect(harness.session.getSnapshot().validation.status).toBe('valid'),
    );

    receiveManifest(harness, (manifest) => {
      delete manifest.mapbox_token;
    });

    await waitFor(() =>
      expect(harness.session.getSnapshot().validation.status).toBe('invalid'),
    );
    expect(validationIssues(harness)).toContainEqual(
      expect.objectContaining({
        path: expect.arrayContaining(['mapOptions', 'tokenAssetId']),
      }),
    );
    // The layer is untouched, so nothing is reported against it.
    expect(
      validationIssues(harness).some((issue) =>
        issue.path.includes('dataSourceAssetId'),
      ),
    ).toBe(false);
  });

  it('follows the change without issuing one of its own', async () => {
    const harness = openEditor();
    await screen.findByRole('button', { name: 'Change the map layer' });
    const submitted = vi.spyOn(harness.host, 'submit');

    receiveManifest(harness, (manifest) => {
      delete manifest.geo_data;
    });

    await waitFor(() =>
      expect(harness.session.getSnapshot().validation.status).toBe('invalid'),
    );
    expect(submitted).not.toHaveBeenCalled();
    expect(harness.pendingCommands()).toEqual([]);
  });
});

describe('the places a geospatial stage asks about', () => {
  it('shows each prompt as the participant will read it', async () => {
    openEditor();

    expect(await screen.findByText('Where do you live?')).toBeInTheDocument();
  });

  it('adds a prompt recording an existing location attribute', async () => {
    const harness = openEditor();

    await harness.user.click(
      screen.getByRole('button', { name: 'Create new prompt' }),
    );
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Prompt text' }),
      'Where do you work?',
    );
    const dialog = within(screen.getByRole('dialog'));
    await harness.user.selectOptions(
      dialog.getByRole('combobox', { name: 'Location attribute' }),
      'location',
    );
    await harness.user.click(dialog.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    const prompts = request?.stageDocument.prompts;
    expect(Array.isArray(prompts) ? prompts : []).toHaveLength(2);
    expect((Array.isArray(prompts) ? prompts : [])[1]).toMatchObject({
      text: 'Where do you work?',
      variable: 'location',
    });
  });

  /**
   * A location attribute created here is a real part of the protocol, made
   * through the codebook's own compound-edit path — not something this prompt
   * invented for itself and wrote into the stage.
   */
  it('creates a location attribute through the codebook, not the stage', async () => {
    const harness = openEditor();
    const submitted = vi.spyOn(harness.host, 'submit');

    await harness.user.click(
      screen.getByRole('button', { name: 'Create new prompt' }),
    );
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Prompt text' }),
      'Where were you born?',
    );
    await harness.user.click(
      screen.getByRole('button', { name: 'Create a new location attribute' }),
    );
    const creator = within(
      await screen.findByRole('dialog', {
        name: 'Create a new location attribute',
      }),
    );
    await harness.user.type(
      creator.getByRole('textbox', { name: /name/i }),
      'birthplace',
    );
    await harness.user.click(
      creator.getByRole('button', { name: /^(Save|Create)/ }),
    );

    await waitFor(() => expect(submitted).toHaveBeenCalledOnce());
    const [submission] = submitted.mock.calls[0] ?? [];
    expect(submission?.edits).toHaveLength(1);
    expect(submission?.edits[0]?.sectionId).toBe(PERSON_SECTION);
    const person = harness.host.getSnapshot().protocolSections[PERSON_SECTION];
    const variables = (person?.variables ?? {}) as Record<string, SectionDoc>;
    expect(
      Object.values(variables).some(
        (variable) =>
          variable.name === 'birthplace' && variable.type === 'location',
      ),
    ).toBe(true);
  });

  it('refuses a stage that asks nothing', async () => {
    const harness = openEditor();

    await harness.user.click(
      screen.getByRole('button', { name: 'Remove prompt' }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Remove prompt' }),
    );

    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByText(
        'Create at least one prompt. A stage with no prompts asks the participant nothing.',
      ),
    ).toBeInTheDocument();
  });
});

describe('leaving a geospatial stage without saving', () => {
  it('leaves no staged resource and no pending command behind', async () => {
    const harness = openEditor();
    await harness.user.selectOptions(
      screen.getByRole('combobox', { name: 'Basemap' }),
      'mapbox://styles/mapbox/dark-v11',
    );

    await act(async () => {
      await harness.cancel();
    });

    expect(harness.pendingCommands()).toEqual([]);
    const listed = await harness.gateway.list();
    expect(listed.status).toBe('ok');
    expect(
      listed.status === 'ok'
        ? listed.data.filter((entry) => entry.status === 'staged')
        : [],
    ).toEqual([]);
  });
});
