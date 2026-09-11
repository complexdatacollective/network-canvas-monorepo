import { act, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { sectionId } from '@codaco/studio-sync/taxonomy';

import {
  attributeField,
  chooseAttributeById,
  offeredAttributes,
} from '../../../testing/attributePicker.ts';
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

/** One more attribute this stage's prompts could record a place in. */
const addLocationAttribute = (
  harness: ReturnType<typeof openEditor>,
  id: string,
): void => {
  asCollaborator(harness, PERSON, (person) => ({
    ...person,
    variables: {
      ...(typeof person.variables === 'object' && person.variables !== null
        ? person.variables
        : {}),
      [id]: { name: id, type: 'location' },
    },
  }));
};

/**
 * The stage as another tool could have authored it: two prompts recording one
 * attribute.
 *
 * Not reachable through this editor, which is the point — the picker offers no
 * attribute a sibling prompt records — so the state a save gate exists for is
 * seeded rather than performed.
 */
const openTwoPromptsOnOneAttribute = () => {
  const { type, fields } = loadFixtureStage('geospatial-1');
  return renderStageEditor({
    stage: {
      type,
      fields: {
        ...fields,
        prompts: [
          {
            id: 'geospatial-prompt-1',
            text: 'Where do you live?',
            variable: 'location',
          },
          {
            id: 'geospatial-prompt-2',
            text: 'Where do you work?',
            variable: 'location',
          },
        ],
      },
    },
    sections: geospatialSections,
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
      'Prompt collection',
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
    await harness.opened();
    addLocationAttribute(harness, 'workplace');

    const dialog = await openPrompt(harness, 'Create new prompt');
    await harness.user.type(
      dialog.getByRole('textbox', { name: 'Prompt text' }),
      'Work?',
    );
    // The attribute the stage's own prompt already records is not among them:
    // this list is what is left.
    const picker = attributeField('Location attribute');
    expect(await offeredAttributes(harness.user, picker)).toEqual([
      'workplace',
    ]);
    await chooseAttributeById(harness.user, picker, 'workplace');
    await harness.user.click(dialog.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    const prompts = request?.stageDocument.prompts;
    expect(Array.isArray(prompts) ? prompts : []).toHaveLength(2);
    expect((Array.isArray(prompts) ? prompts : [])[1]).toMatchObject({
      text: 'Work?',
      variable: 'workplace',
    });
  });

  /**
   * The interview writes each answer into its own prompt's attribute, so two
   * prompts recording one attribute leave the stage holding only the last
   * place the participant chose — and nothing downstream can say so, because
   * both prompts name a location attribute and the schema is satisfied.
   *
   * The fixture's type has exactly one such attribute and its only prompt
   * already records it, so there is nothing left for a second prompt to
   * choose. Asked and answered where a network composer's form fields ask it
   * of their own siblings.
   */
  it('offers no location attribute another prompt already records', async () => {
    const harness = openEditor();
    await harness.opened();

    const dialog = await openPrompt(harness, 'Create new prompt');
    // No trigger at all rather than a window offering nothing: with nothing to
    // choose and no way to create one from inside it, the field says so where
    // the control would have been.
    expect(
      within(attributeField('Location attribute')).queryByRole('button', {
        name: /^(Select|Change) attribute$/,
      }),
    ).toBeNull();
    expect(
      dialog.getByText(
        'No location attribute is free for this prompt. Create one to record where the participant chooses.',
      ),
    ).toBeInTheDocument();
  });

  /**
   * The other half of the same rule, for the state the picker cannot prevent:
   * a stage that ARRIVED with two prompts on one attribute — authored by
   * another tool, or by an older version of this one — is refused at the row
   * that holds the duplicate, under the control that resolves it.
   */
  it('refuses to save a prompt holding an attribute another prompt records', async () => {
    const harness = openTwoPromptsOnOneAttribute();
    await harness.opened();

    await harness.user.click(
      screen.getAllByRole('button', { name: 'Edit prompt' })[1] as HTMLElement,
    );
    const dialog = within(await screen.findByRole('dialog'));
    expect(
      within(attributeField('Location attribute')).getByText('location'),
    ).toBeVisible();

    await harness.user.click(dialog.getByRole('button', { name: 'Save' }));

    expect(
      await dialog.findByText(
        'Another prompt on this stage already records this attribute, and the later answer would replace the earlier one. Choose a different attribute, or edit the existing prompt instead.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
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

    // Both added by somebody else, so nothing in the protocol uses either:
    // what keeps the nickname out of the list is its TYPE and nothing else,
    // and the free location attribute is what leaves the list non-empty now
    // that the stage's own prompt has taken the fixture's only one.
    asCollaborator(harness, PERSON, (person) => ({
      ...person,
      variables: {
        ...(typeof person.variables === 'object' && person.variables !== null
          ? person.variables
          : {}),
        nickname: { name: 'nickname', type: 'text', component: 'Text' },
        workplace: { name: 'workplace', type: 'location' },
      },
    }));

    await openPrompt(harness, 'Create new prompt');
    expect(
      await offeredAttributes(
        harness.user,
        attributeField('Location attribute'),
      ),
    ).toEqual(['workplace']);
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
    // Asserted against an attribute no prompt on this stage records, so what
    // removes it from the list is the form elsewhere and nothing else.
    addLocationAttribute(harness, 'workplace');

    const before = await openPrompt(harness, 'Create new prompt');
    expect(
      await offeredAttributes(
        harness.user,
        attributeField('Location attribute'),
      ),
    ).toEqual(['workplace']);
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
          { variable: 'workplace', prompt: 'Where do they work?' },
        ],
      },
    }));

    const after = await openPrompt(harness, 'Create new prompt');
    expect(
      within(attributeField('Location attribute')).queryByRole('button', {
        name: /^(Select|Change) attribute$/,
      }),
    ).toBeNull();
    expect(
      after.getByText(
        'No location attribute is free for this prompt. Create one to record where the participant chooses.',
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
    await harness.user.type(
      dialog.getByRole('textbox', { name: 'Prompt text' }),
      'Where were you born?',
    );
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
    // The picker shows the researcher's NAME for the attribute, and the prompt
    // stores its id, so both are read: the field for what is on screen, and the
    // saved stage for the reference that outlives the dialog.
    await waitFor(() =>
      expect(
        within(attributeField('Location attribute')).getByText('born'),
      ).toBeVisible(),
    );

    await harness.user.click(dialog.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    const request = await harness.submit();
    const prompts = request?.stageDocument.prompts;
    expect((Array.isArray(prompts) ? prompts : [])[1]).toMatchObject({
      text: 'Where were you born?',
      variable: created,
    });
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
