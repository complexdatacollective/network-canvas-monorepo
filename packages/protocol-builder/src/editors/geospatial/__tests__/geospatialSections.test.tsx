import { act, screen, waitFor, type within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { sectionId } from '@codaco/studio-sync/taxonomy';

import {
  expectMapboxMocked,
  mapsBuilt,
  resetMapboxMock,
} from '../../../testing/mapboxMock.ts';
import { loadFixtureStage } from '../../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import {
  awaitLayerRead,
  enterCoordinate,
  geospatialSections,
  mapOptionsOf,
  openPrompt,
} from './geospatialFixtures.tsx';

/**
 * The prompt text is a rich-text editor, and its editing surface cannot be
 * driven in jsdom: ProseMirror places the caret through `elementFromPoint` and
 * `getClientRects`, neither of which jsdom implements, so typing throws rather
 * than producing text. A plain input carrying the same value keeps these tests
 * about what they are for — what a geospatial prompt records, and what reaches
 * the stage — and the editor itself is covered by its own test.
 */
vi.mock('../../../fields/RichTextField.tsx', () => ({
  default: ({
    id,
    name,
    value,
    onChange,
  }: Readonly<{
    id?: string;
    name?: string;
    value?: unknown;
    onChange?: (next: string) => void;
  }>) => (
    <input
      id={id}
      name={name}
      value={typeof value === 'string' ? value : ''}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
}));

const openEditor = () =>
  renderStageEditor({ stageId: 'geospatial-1', sections: geospatialSections });

/** The stage this stage's own subject also appears on, as a form. */
const ALTER_FORM = sectionId({ kind: 'stage', stageId: 'alter-form-1' });

/** The node type both of them are about. */
const PERSON = sectionId({ kind: 'codebookNode', typeId: 'person' });

/**
 * The attributes a prompt's dialog is offering, by id.
 *
 * Without the select's own "choose something" entry, which is presentation
 * rather than an attribute the researcher may record an answer in.
 */
const offeredAttributes = (
  dialog: ReturnType<typeof within>,
): (string | undefined)[] =>
  [
    ...dialog
      .getByRole('combobox', { name: 'Location attribute' })
      .querySelectorAll('option'),
  ]
    .map((option) => option.value)
    .filter((value) => value !== '');

/**
 * Rewrites one section of the protocol as somebody else's change.
 *
 * The whole document, because that is what a section write is; the caller
 * reads what is there and hands back what it should be instead.
 */
const asCollaborator = (
  harness: ReturnType<typeof openEditor>,
  section: ReturnType<typeof sectionId>,
  rewrite: (current: Record<string, unknown>) => Record<string, unknown>,
): void => {
  const current = harness.host.store.read(section).document;
  act(() => {
    harness.host.store.applyAsCollaborator(section, rewrite({ ...current }));
  });
};

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

    // The type the stage places on the map, and the stage's own name, belong
    // to sections this mount does not include.
    await harness.roundTrip({ unowned: ['subject', 'label'] });
  });

  /**
   * Four decisions a researcher makes at different times, each finishable on
   * its own, so the outline reports on each of them separately.
   */
  it('reports each map decision separately', async () => {
    const harness = openEditor();

    await waitFor(() => expect(harness.outline()).toHaveLength(5));
    expect(harness.outline().map((entry) => entry.title)).toEqual([
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

  /**
   * The one thing this field exists to do: the property a participant's answer
   * is stored as is read from the layer itself, not typed. The harness serves
   * the real bytes of `regions.geojson`, whose features carry `name`, so a
   * field that offered a guess — or reported the layer as unreadable — fails
   * here.
   */
  it('offers the properties the chosen map layer actually carries', async () => {
    openEditor();

    const picker = await awaitLayerRead();

    expect(
      [...picker.querySelectorAll('option')].map((option) => option.value),
    ).toContain('name');
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
    expect(mapOptionsOf(request?.stageDocument ?? {})).toMatchObject({
      style: 'mapbox://styles/mapbox/dark-v11',
      showTransit: true,
      initialZoom: 14,
      // Untouched keys of the same object survive: each control writes at its
      // own path inside `mapOptions`, so a setting nothing here touched is not
      // swept away by one that changed.
      tokenAssetId: 'mapbox_token',
      dataSourceAssetId: 'geo_data',
      targetFeatureProperty: 'name',
    });
  });

  it('saves the highlight colour selectable areas are drawn in', async () => {
    const harness = openEditor();

    await harness.user.click(
      screen.getByRole('radio', { name: 'Highlight color 1' }),
    );

    const request = await harness.submit();
    expect(mapOptionsOf(request?.stageDocument ?? {}).color).toBe(
      'ord-color-seq-1',
    );
  });

  /**
   * Searching is the only way a participant reaches somewhere that is not
   * already on screen, so whether it is offered is a decision about what the
   * stage asks of them rather than a detail of the map. `allowSearch` is an
   * optional key, and an optional key with no control of its own is one a
   * researcher can neither read nor change — so it is asserted directly here
   * rather than only as part of a stage that round-trips.
   */
  it('saves whether the participant may search the map', async () => {
    const harness = openEditor();

    await harness.user.click(
      screen.getByRole('switch', { name: 'Allow searching the map' }),
    );

    const request = await harness.submit();
    expect(mapOptionsOf(request?.stageDocument ?? {}).allowSearch).toBe(true);
  });

  it('opens with searching switched on when the stage already allows it', () => {
    const { type, fields } = loadFixtureStage('geospatial-1');
    const seededOptions =
      typeof fields.mapOptions === 'object' && fields.mapOptions !== null
        ? fields.mapOptions
        : {};
    renderStageEditor({
      stage: {
        type,
        fields: {
          ...fields,
          mapOptions: { ...seededOptions, allowSearch: true },
        },
      },
      sections: geospatialSections,
    });

    expect(
      screen.getByRole('switch', { name: 'Allow searching the map' }),
    ).toBeChecked();
  });

  it('saves a starting centre entered as two coordinates', async () => {
    const harness = openEditor();

    await enterCoordinate(harness, 'Longitude', '-0.12');
    await enterCoordinate(harness, 'Latitude', '51.5');

    const request = await harness.submit();
    expect(mapOptionsOf(request?.stageDocument ?? {}).center).toEqual([
      -0.12, 51.5,
    ]);
  });

  it('refuses a centre outside the world', async () => {
    const harness = openEditor();

    await enterCoordinate(harness, 'Longitude', '999');

    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByText('Longitude must be between -180 and 180.'),
    ).toBeInTheDocument();
  });

  it('refuses a zoom the map cannot show, in the control’s own words', async () => {
    const harness = openEditor();

    const zoom = screen.getByRole('spinbutton', { name: 'Starting zoom' });
    await harness.user.clear(zoom);
    await harness.user.type(zoom, '30');

    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByText('Starting zoom must be between 0 and 22.'),
    ).toBeInTheDocument();
  });
});

describe('the places a geospatial stage asks about', () => {
  it('shows each prompt as the participant will read it', async () => {
    openEditor();

    expect(await screen.findByText('Where do you live?')).toBeInTheDocument();
  });

  it('adds a prompt recording an existing location attribute', async () => {
    const harness = openEditor();

    const dialog = await openPrompt(harness, 'Create new prompt');
    await harness.user.type(
      dialog.getByRole('textbox', { name: 'Prompt text' }),
      'Work?',
    );
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
      text: 'Work?',
      variable: 'location',
    });
  });

  /**
   * Only an attribute that can hold a PLACE, whatever else the type carries.
   *
   * A geospatial answer is a point on a map. Offered a text attribute, a
   * researcher could bind a prompt to one and the interview would have
   * nowhere to put what the participant tapped — and the refusal, when it
   * came, would be the schema's rather than this control's.
   */
  it('offers no attribute that cannot hold a place', async () => {
    const harness = openEditor();
    await harness.opened();

    // Added by somebody else, so nothing in the protocol uses it: what keeps
    // it out of the list is its TYPE and nothing else.
    asCollaborator(harness, PERSON, (person) => ({
      ...person,
      variables: {
        ...(typeof person.variables === 'object' && person.variables !== null
          ? person.variables
          : {}),
        nickname: { name: 'nickname', type: 'text', component: 'Text' },
      },
    }));

    const dialog = await openPrompt(harness, 'Create new prompt');
    expect(offeredAttributes(dialog)).toEqual(['location']);
  });

  /**
   * What the interview does with a geospatial answer: it writes the point the
   * participant tapped straight into the attribute, around whatever validation
   * the codebook holds for it.
   *
   * So an attribute a FORM collects — through those very rules — is not
   * offered here, or an export would carry checked and unchecked answers under
   * one name. The form is on another stage and a collaborator adds the field
   * while this editor is open, which is the only way the claim can be reached:
   * this stage's own use of the attribute is its own and is never counted
   * against it.
   */
  it('stops offering a location attribute a form elsewhere collects', async () => {
    const harness = openEditor();
    await harness.opened();

    const before = await openPrompt(harness, 'Create new prompt');
    expect(offeredAttributes(before)).toEqual(['location']);
    await harness.user.click(before.getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    asCollaborator(harness, ALTER_FORM, (stage) => ({
      ...stage,
      form: {
        fields: [
          ...(Array.isArray(
            (stage.form as Record<string, unknown> | undefined)?.fields,
          )
            ? ((stage.form as Record<string, unknown>).fields as unknown[])
            : []),
          { variable: 'location', prompt: 'Where do they live?' },
        ],
      },
    }));

    const after = await openPrompt(harness, 'Create new prompt');
    expect(
      after.queryByRole('combobox', { name: 'Location attribute' }),
    ).toBeNull();
    expect(
      after.getByText(
        'This type has no location attributes yet. Create one to record where the participant chooses.',
      ),
    ).toBeInTheDocument();
  });

  /**
   * A location attribute created here is a real part of the protocol, made
   * through the codebook's own write — not something this prompt invented for
   * itself and wrote into the stage. It is also BOUND to the prompt that asked
   * for it, or the researcher has to go and find it themselves.
   */
  it('creates a location attribute through the codebook, and binds it', async () => {
    const harness = openEditor();

    const dialog = await openPrompt(harness, 'Create new prompt');
    await harness.user.click(
      dialog.getByRole('button', { name: 'Create a new location attribute' }),
    );
    const nameBox = await screen.findByRole('textbox', {
      name: 'Attribute name',
    });
    await harness.user.type(nameBox, 'born');
    await harness.user.click(
      screen.getByRole('button', { name: 'Create attribute' }),
    );

    await waitFor(() => {
      const person = harness.hostCodebook().node?.person;
      expect(
        Object.values(person?.variables ?? {}).some(
          (variable) =>
            variable.name === 'born' && variable.type === 'location',
        ),
      ).toBe(true);
    });

    const created = Object.entries(
      harness.hostCodebook().node?.person?.variables ?? {},
    ).find(([, variable]) => variable.name === 'born')?.[0];
    await waitFor(() =>
      expect(
        dialog.getByRole('combobox', { name: 'Location attribute' }),
      ).toHaveValue(created),
    );
  });

  it('refuses a stage that asks nothing', async () => {
    const harness = openEditor();

    await harness.user.click(
      screen.getByRole('button', { name: 'Delete prompt' }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Delete prompt' }),
    );

    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByText(
        'Create at least one prompt. A stage with no prompts asks the participant nothing.',
      ),
    ).toBeInTheDocument();
  });
});
