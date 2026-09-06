import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import type { FinishRequest } from '../../../session.ts';
import { loadFixtureStage } from '../../../testing/protocolFixture.ts';
import {
  renderStageEditor,
  type StageEditorHarness,
} from '../../../testing/renderStageEditor.tsx';
import BackgroundSection from '../BackgroundSection.tsx';
import ComposerEdgeConfigurationSection from '../ComposerEdgeConfigurationSection.tsx';
import ComposerNodeConfigurationSection from '../ComposerNodeConfigurationSection.tsx';

const sections = (
  <>
    <ComposerNodeConfigurationSection />
    <ComposerEdgeConfigurationSection />
    <BackgroundSection allowsImage />
  </>
);

const openEditor = () => ({ stageId: 'network-composer-1', sections });

/**
 * The fixture stage plus one connection type that already carries attributes,
 * which the fixture itself has none of. What it proves is that the tick list
 * never rebuilds an entry it did not remove.
 */
const CONFIGURED_EDGE: SectionDoc = {
  id: 'composer-edge-1',
  subject: { entity: 'edge', type: 'knows' },
  form: { fields: [{ variable: 'edgeNotes', component: 'Text' }] },
};

const openWithConfiguredEdge = () => {
  const { type, fields } = loadFixtureStage('network-composer-1');
  return {
    stage: {
      id: 'network-composer-edges',
      type,
      fields: { ...fields, edges: [CONFIGURED_EDGE] },
    },
    sections,
  };
};

/**
 * The form the node inspector shows, as a stage authored elsewhere holds it.
 *
 * The fixture composer asks nothing about a node, so a stage that does has to
 * be built here — and a key nothing renders survives a save untouched, so this
 * is the only thing that can catch a missing section. Each pairing is one the
 * protocol schema accepts: `name` is text and `contactFreq` is ordinal.
 */
const CONFIGURED_NODE_FORM: SectionDoc = {
  nodeForm: {
    fields: [
      {
        id: 'composer-node-field-1',
        variable: 'name',
        component: 'Text',
        label: 'What do you call them?',
        hint: 'A first name is enough.',
      },
      {
        id: 'composer-node-field-2',
        variable: 'contactFreq',
        component: 'RadioGroup',
      },
    ],
  },
};

const openWithConfiguredForms = () => {
  const { type, fields } = loadFixtureStage('network-composer-1');
  return {
    stage: {
      id: 'network-composer-forms',
      type,
      fields: { ...fields, ...CONFIGURED_NODE_FORM, edges: [CONFIGURED_EDGE] },
    },
    sections,
  };
};

describe('what a network composer lets the participant build', () => {
  it('saves the stage it opened, unchanged', async () => {
    const harness = renderStageEditor(openEditor());

    // The stage's name and the type it composes belong to sections this
    // mount does not include.
    await harness.roundTrip({ unowned: ['label', 'subject'] });
  });

  it('saves a stage whose connections are configured, unchanged', async () => {
    const harness = renderStageEditor(openWithConfiguredEdge());

    await harness.roundTrip({ unowned: ['label', 'subject'] });
  });

  /**
   * A composer authors more than one form: the node inspector's, and one per
   * connection type it draws. Both are the researcher's work, so both have to
   * be owned by something on screen — a form no section renders is a form a
   * researcher cannot see or change, and re-saving the stage would be their
   * only warning that anything was there.
   */
  it('saves a stage whose node and connection forms are configured, unchanged', async () => {
    const harness = renderStageEditor(openWithConfiguredForms());

    const request = await harness.roundTrip({ unowned: ['label', 'subject'] });

    expect(harness.ownedKeys()).toContain('nodeForm');
    expect(request.stageDocument.nodeForm).toEqual(
      CONFIGURED_NODE_FORM.nodeForm,
    );
    expect(request.stageDocument.edges).toEqual([CONFIGURED_EDGE]);
  });

  it('shows the researcher what each of those forms asks', async () => {
    renderStageEditor(openWithConfiguredForms());

    expect(
      await screen.findByText('What do you call them?'),
    ).toBeInTheDocument();
    // The second node field has no question of its own, so it reads as the
    // attribute it records.
    expect(screen.getByText('contactFreq')).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: 'Attributes for "knows" connections' }),
    ).toBeInTheDocument();
  });

  it('lists what the stage already holds', async () => {
    const harness = renderStageEditor(openEditor());

    await waitFor(() => expect(harness.outline()).toHaveLength(4));
    expect(harness.outline().map((section) => section.title)).toEqual([
      'Adding and arranging nodes',
      'Node attributes',
      'Connections',
      'Background',
    ]);
  });

  it('groups nodes by the attribute the researcher chose', async () => {
    const harness = renderStageEditor(openEditor());

    await harness.user.selectOptions(
      await screen.findByRole('combobox', { name: 'Grouping attribute' }),
      'contactType',
    );

    const request = await harness.submit();
    expect(request?.stageDocument.convexHullVariable).toBe('contactType');
  });

  /**
   * The fixture composer says nothing about automatic layout, and a
   * researcher who never touched the toggle has decided nothing either.
   * Absence is how the schema spells that, so the save may not invent a
   * default — nor the empty `behaviours` container a leaf field assembles
   * around one.
   */
  it('writes no behaviours at all for a stage that arrived without them', async () => {
    const harness = renderStageEditor(openEditor());

    const request = await harness.submit();
    expect(Object.hasOwn(request?.stageDocument ?? {}, 'behaviours')).toBe(
      false,
    );
  });

  it('takes the key away again when automatic layout is switched back off', async () => {
    const harness = renderStageEditor(openEditor());
    const toggle = screen.getByRole('switch', {
      name: 'Start with automatic layout switched on',
    });

    await harness.user.click(toggle);
    await harness.user.click(toggle);

    const request = await harness.submit();
    expect(Object.hasOwn(request?.stageDocument ?? {}, 'behaviours')).toBe(
      false,
    );
  });

  it('starts the stage with automatic layout switched on', async () => {
    const harness = renderStageEditor(openEditor());

    await harness.user.click(
      screen.getByRole('switch', {
        name: 'Start with automatic layout switched on',
      }),
    );

    const request = await harness.submit();
    expect(request?.stageDocument.behaviours).toEqual({
      automaticLayout: true,
    });
  });

  /**
   * The control lives on the STAGE rather than on the codebook attribute, so
   * choosing the attribute cannot settle it — but the codebook's own control
   * is what the researcher already decided this attribute looks like, so it is
   * what the field starts with.
   */
  it('asks something about each node, with the control the attribute already uses', async () => {
    const harness = renderStageEditor(openEditor());

    await harness.user.click(
      screen.getByRole('switch', { name: 'Node attributes' }),
    );
    await harness.user.click(
      await screen.findByRole('button', {
        name: 'Create new node attribute field',
      }),
    );
    // Queries are scoped to the dialog: `screen` would search the whole
    // editor, computing an accessible name for every control behind the
    // dialog to answer a question about one inside it.
    const field = within(await screen.findByRole('dialog'));
    await harness.user.selectOptions(
      field.getByRole('combobox', { name: 'Attribute' }),
      'age',
    );
    await harness.user.type(
      field.getByRole('textbox', { name: 'Question' }),
      'Age?',
    );
    await harness.user.click(field.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    expect(request?.stageDocument.nodeForm).toEqual({
      fields: [
        {
          id: expect.any(String) as unknown as string,
          variable: 'age',
          component: 'Number',
          label: 'Age?',
        },
      ],
    });
  });

  /**
   * A connection's form records the attributes of its OWN edge type, so each
   * ticked type is asked about separately — and its fields are written into
   * the entry that names it rather than into a list of their own.
   */
  it('asks something about each connection of one kind', async () => {
    const harness = renderStageEditor(openEditor());

    await harness.user.click(
      await screen.findByRole('checkbox', { name: 'knows' }),
    );
    await harness.user.click(
      await screen.findByRole('button', {
        name: 'Create new attribute field for "knows" connections',
      }),
    );
    const field = within(await screen.findByRole('dialog'));
    await harness.user.selectOptions(
      field.getByRole('combobox', { name: 'Attribute' }),
      'edgeNotes',
    );
    await harness.user.click(field.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    expect(request?.stageDocument.edges).toEqual([
      {
        id: expect.any(String) as unknown as string,
        subject: { entity: 'edge', type: 'knows' },
        form: {
          fields: [
            {
              id: expect.any(String) as unknown as string,
              variable: 'edgeNotes',
              // The codebook renders `edgeNotes` in a multi-line box, so a
              // field for it starts there rather than at the first control the
              // schema happens to allow.
              component: 'TextArea',
            },
          ],
        },
      },
    ]);
  });

  it('gives a newly drawable connection type an identity of its own', async () => {
    const harness = renderStageEditor(openEditor());

    await harness.user.click(
      await screen.findByRole('checkbox', { name: 'knows' }),
    );

    const request = await harness.submit();
    expect(request?.stageDocument.edges).toEqual([
      {
        id: expect.any(String) as unknown as string,
        subject: { entity: 'edge', type: 'knows' },
      },
    ]);
  });

  /**
   * The entry is more than the type it names: it carries the attributes the
   * participant fills in for that connection. Rebuilding it because a
   * neighbour was ticked would throw those away.
   */
  it('leaves a configured connection type exactly as it was', async () => {
    const harness = renderStageEditor(openWithConfiguredEdge());

    await harness.user.click(
      await screen.findByRole('checkbox', { name: 'family_edge' }),
    );

    const request = await harness.submit();
    const edges = request?.stageDocument.edges;
    expect(Array.isArray(edges) ? edges[0] : undefined).toEqual(
      CONFIGURED_EDGE,
    );
    expect(Array.isArray(edges) ? edges[1] : undefined).toEqual({
      id: expect.any(String) as unknown as string,
      subject: { entity: 'edge', type: 'family_edge' },
    });
  });

  /**
   * "This stage draws no connections" is spelled by the key not being there.
   * An empty list would say something else — a capability configured and left
   * holding nothing — which is not what the researcher did.
   */
  it('leaves the key out entirely when every connection type is unticked', async () => {
    const harness = renderStageEditor(openWithConfiguredEdge());

    await harness.user.click(
      await screen.findByRole('checkbox', { name: 'knows' }),
    );

    const request = await harness.submit();
    expect(Object.hasOwn(request?.stageDocument ?? {}, 'edges')).toBe(false);
  });

  /**
   * A composer needs a position attribute, and a protocol may not have a
   * spare one. Creating it is a compound edit that lands in the codebook on
   * its own; choosing it is an ordinary unsaved change to this stage.
   */
  it('creates a position attribute without leaving the stage', async () => {
    const harness = renderStageEditor(openEditor());

    await harness.user.click(
      await screen.findByRole('button', {
        name: 'Create a new position attribute',
      }),
    );
    const creator = within(await screen.findByRole('dialog'));
    await harness.user.type(
      creator.getByRole('textbox', { name: 'Attribute name' }),
      'seats',
    );
    await harness.user.click(
      creator.getByRole('button', { name: 'Create attribute' }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const picker = await screen.findByRole('combobox', {
      name: 'Position attribute',
    });
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'seats' })).toBeInTheDocument(),
    );
    const chosen = (picker as HTMLSelectElement).value;
    expect(chosen).not.toBe('layout');

    const request = await harness.submit();
    expect(request?.stageDocument.layoutVariable).toBe(chosen);
  });

  it('leaves nothing pending when the edit is abandoned', async () => {
    const harness = renderStageEditor(openEditor());

    await harness.user.click(
      await screen.findByRole('checkbox', { name: 'knows' }),
    );
    await harness.cancel();

    expect(harness.pendingCommands()).toEqual([]);
    expect(harness.session.getSnapshot().stagedResources).toEqual([]);
  });
});

const PERSON_SECTION = sectionId({ kind: 'codebookNode', typeId: 'person' });
const KNOWS_SECTION = sectionId({ kind: 'codebookEdge', typeId: 'knows' });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The attributes the host currently files under the composer's node type. */
const personVariables = (
  harness: StageEditorHarness,
): Record<string, unknown> => {
  const definition =
    harness.host.getSnapshot().protocolSections[PERSON_SECTION];
  const variables = isRecord(definition) ? definition.variables : undefined;
  return isRecord(variables) ? variables : {};
};

/**
 * One more attribute on a type this composer works with, put there from
 * outside the editor.
 *
 * The whole section is replaced rather than the one key, because an entity
 * definition is parsed WHOLE: a document carrying only `variables` is a person
 * type with no name, which the protocol context drops altogether — and the
 * picker then offers nothing at all, which would satisfy an "is not offered"
 * claim for entirely the wrong reason.
 */
const addSubjectVariable = (
  harness: StageEditorHarness,
  place: Readonly<{
    entity: 'node' | 'edge';
    typeId: string;
    section: string;
  }>,
  variableId: string,
  variable: Readonly<Record<string, unknown>>,
): void => {
  const section = harness.session.getSnapshot().protocolSections[place.section];
  if (section === undefined) {
    throw new Error(`the fixture has no "${place.typeId}" type`);
  }
  const variables = isRecord(section.variables) ? section.variables : {};
  if (Object.hasOwn(variables, variableId)) {
    throw new Error(
      `"${place.typeId}" already has a "${variableId}" attribute, so adding one proves nothing.`,
    );
  }
  const replacement = {
    [place.typeId]: {
      ...section,
      variables: { ...variables, [variableId]: variable },
    },
  };
  harness.receiveCodebookUpdate(
    place.entity === 'node' ? { node: replacement } : { edge: replacement },
  );
};

const addPersonVariable = (
  harness: StageEditorHarness,
  variableId: string,
  variable: Readonly<Record<string, unknown>>,
): void =>
  addSubjectVariable(
    harness,
    { entity: 'node', typeId: 'person', section: PERSON_SECTION },
    variableId,
    variable,
  );

const addKnowsVariable = (
  harness: StageEditorHarness,
  variableId: string,
  variable: Readonly<Record<string, unknown>>,
): void =>
  addSubjectVariable(
    harness,
    { entity: 'edge', typeId: 'knows', section: KNOWS_SECTION },
    variableId,
    variable,
  );

/**
 * What a composer field's ATTRIBUTE holds, reached from the field that records
 * it.
 *
 * The same surface every other form field offers, because the question is the
 * same one: a researcher who has just bound a field to a list of answers is
 * already looking at the place to author the list. Which is exactly what
 * Architect's own composer editor offers ("Choice values"), and what this
 * editor had no answer to at all.
 *
 * What it does NOT offer is the settings the chosen control takes. Everywhere
 * else those belong to the codebook attribute, keyed to the `component` the
 * codebook records; a composer field carries its own `component` and its own
 * `parameters` on the STAGE, so the same attribute may be a plain date picker
 * here and a relative one on the next form. Written to the codebook they would
 * be authored against a control the codebook does not have.
 */
describe('what a composer field’s attribute holds', () => {
  it('authors the values an attribute offers, from the field that records it', async () => {
    const harness = renderStageEditor(openWithConfiguredForms());

    // The second node field records `contactFreq`, which IS a list of answers.
    await harness.user.click(
      (
        await screen.findAllByRole('button', {
          name: 'Edit node attribute field',
        })
      )[1]!,
    );
    const field = within(await screen.findByRole('dialog'));
    await harness.user.click(
      await field.findByRole('button', {
        name: 'Change this attribute’s values',
      }),
    );
    await harness.user.click(
      screen.getByRole('button', { name: 'Add option' }),
    );
    await harness.user.type(
      screen.getByRole('textbox', { name: 'Option 4 label' }),
      'Never',
    );
    await harness.user.type(
      screen.getByRole('textbox', { name: 'Option 4 value' }),
      'never',
    );
    await harness.user.click(
      screen.getByRole('button', { name: 'Save attribute' }),
    );

    // On the codebook attribute, which is where a list of answers lives — the
    // field records the answer, it does not own what may be answered.
    await waitFor(() => {
      const contactFreq = personVariables(harness).contactFreq;
      expect(isRecord(contactFreq) ? contactFreq.options : undefined).toEqual([
        { label: 'Weekly', value: 3 },
        { label: 'Monthly', value: 2 },
        { label: 'Rarely', value: 1 },
        { label: 'Never', value: 'never' },
      ]);
    });
  });

  it('leaves what the control accepts to the field, and asks for it there', async () => {
    const harness = renderStageEditor(openEditor());
    // A kind of attribute whose control DOES take settings, which the fixture
    // person type has none of — so without this the claim below would hold for
    // the boring reason that no control here takes any.
    addPersonVariable(harness, 'met_on', { name: 'met_on', type: 'datetime' });

    await harness.user.click(
      screen.getByRole('switch', { name: 'Node attributes' }),
    );
    await harness.user.click(
      await screen.findByRole('button', {
        name: 'Create new node attribute field',
      }),
    );
    const field = within(await screen.findByRole('dialog'));
    await harness.user.selectOptions(
      field.getByRole('combobox', { name: 'Attribute' }),
      'met_on',
    );
    await harness.user.selectOptions(
      field.getByRole('combobox', { name: 'Input control' }),
      'DatePicker',
    );

    // The rules an answer must satisfy are the codebook's here as anywhere.
    expect(
      await field.findByRole('button', { name: 'Set rules for this answer' }),
    ).toBeInTheDocument();
    // The settings that control takes are not, so the codebook's own surface
    // for them is not offered …
    expect(
      field.queryByRole('button', { name: 'Set what this field accepts' }),
    ).not.toBeInTheDocument();
    // … and they are asked for on the field itself instead.
    expect(
      field.getByRole('combobox', { name: 'Date resolution' }),
    ).toBeInTheDocument();
  });
});

/**
 * Which control decides what the CODEBOOK holds, when the row keeps a control
 * of its own.
 *
 * A boolean's two answers are held under a schema keyed on the attribute's own
 * `component`: the `Boolean` control takes the pair of words, and `Toggle` is a
 * strict schema with no `options` key at all. A composer field's control never
 * reaches the attribute, so the codebook's is the only one its schema is keyed
 * on — and a row switched to a toggle here says nothing about what the
 * attribute may hold.
 */
describe('a composer field whose control is not the codebook’s', () => {
  it('offers a boolean’s answer labels by the codebook’s control, not the row’s', async () => {
    const harness = renderStageEditor(openEditor());
    // Nothing writes this one unvalidated, so a form may collect it.
    addPersonVariable(harness, 'consented', {
      name: 'consented',
      type: 'boolean',
      component: 'Boolean',
    });

    await harness.user.click(
      screen.getByRole('switch', { name: 'Node attributes' }),
    );
    await harness.user.click(
      await screen.findByRole('button', {
        name: 'Create new node attribute field',
      }),
    );
    const field = within(await screen.findByRole('dialog'));
    await harness.user.selectOptions(
      field.getByRole('combobox', { name: 'Attribute' }),
      'consented',
    );
    const answerLabels = {
      name: 'Change this attribute’s answer labels',
    } as const;
    expect(await field.findByRole('button', answerLabels)).toBeInTheDocument();

    // Asking for a switch is a decision about THIS form. The attribute still
    // holds the two answers every other form shows for it, so the way to
    // change their wording has to stay where it was.
    await harness.user.selectOptions(
      field.getByRole('combobox', { name: 'Input control' }),
      'Toggle',
    );
    expect(field.getByRole('combobox', { name: 'Input control' })).toHaveValue(
      'Toggle',
    );
    expect(field.getByRole('button', answerLabels)).toBeInTheDocument();
  });
});

/**
 * The settings the chosen input control takes, which a composer field keeps on
 * the STAGE.
 *
 * `ComposerFormFieldSchema` puts `component` and `parameters` on the field
 * itself, which is the whole point of the interface: one attribute can be a
 * date picker bounded by two dates on this form and a relative window on the
 * next. So they are authored here, on the field, and never written to the
 * codebook attribute — whose own schemas are split on the control IT records
 * and would refuse a block authored against a control it does not have.
 *
 * The same controls the codebook's own editor renders, over the same helpers,
 * because the question a researcher is answering is identical; only where the
 * answer is written differs. This is what Architect offers as "Control
 * settings" on the same dialog, and what this editor had no answer to at all.
 */
describe('what a composer field’s control accepts', () => {
  /**
   * A node form field recording a date attribute, with its row dialog open.
   *
   * The fixture person type has no attribute whose control takes settings, so
   * one is added from outside the editor first — otherwise every claim below
   * would hold for the boring reason that nothing here takes any.
   */
  const openDateField = async (harness: StageEditorHarness) => {
    addPersonVariable(harness, 'met_on', { name: 'met_on', type: 'datetime' });

    await harness.user.click(
      screen.getByRole('switch', { name: 'Node attributes' }),
    );
    await harness.user.click(
      await screen.findByRole('button', {
        name: 'Create new node attribute field',
      }),
    );
    const field = within(await screen.findByRole('dialog'));
    await harness.user.selectOptions(
      field.getByRole('combobox', { name: 'Attribute' }),
      'met_on',
    );
    return field;
  };

  /** Saves the open row dialog and waits for it to go. */
  const addRow = async (
    harness: StageEditorHarness,
    field: ReturnType<typeof within>,
  ) => {
    await harness.user.click(field.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  };

  const savedFields = (request: FinishRequest | null): unknown => {
    const nodeForm = request?.stageDocument.nodeForm;
    return isRecord(nodeForm) ? nodeForm.fields : undefined;
  };

  it('records the dates a node field accepts on the field, not on the attribute', async () => {
    const harness = renderStageEditor(openEditor());
    const field = await openDateField(harness);

    // `fireEvent`, because a native date input takes its value whole rather
    // than a keystroke at a time.
    fireEvent.change(field.getByLabelText('Earliest date'), {
      target: { value: '2020-01-01' },
    });
    fireEvent.change(field.getByLabelText('Latest date'), {
      target: { value: '2024-12-31' },
    });
    await addRow(harness, field);

    const request = await harness.submit();
    expect(savedFields(request)).toEqual([
      {
        id: expect.any(String) as unknown as string,
        variable: 'met_on',
        component: 'DatePicker',
        parameters: { min: '2020-01-01', max: '2024-12-31' },
      },
    ]);
    // The attribute is what a date MEANS; the window this form offers is this
    // form's. Nothing reached the codebook.
    expect(personVariables(harness).met_on).toEqual({
      name: 'met_on',
      type: 'datetime',
    });
  });

  it('records the same for a connection’s own form', async () => {
    const harness = renderStageEditor(openWithConfiguredEdge());
    addKnowsVariable(harness, 'first_met', {
      name: 'first_met',
      type: 'datetime',
    });

    await harness.user.click(
      await screen.findByRole('button', {
        name: 'Create new attribute field for "knows" connections',
      }),
    );
    const field = within(await screen.findByRole('dialog'));
    await harness.user.selectOptions(
      field.getByRole('combobox', { name: 'Attribute' }),
      'first_met',
    );
    fireEvent.change(field.getByLabelText('Earliest date'), {
      target: { value: '2010-01-01' },
    });
    await addRow(harness, field);

    const request = await harness.submit();
    expect(request?.stageDocument.edges).toEqual([
      {
        ...CONFIGURED_EDGE,
        form: {
          fields: [
            { variable: 'edgeNotes', component: 'Text' },
            {
              id: expect.any(String) as unknown as string,
              variable: 'first_met',
              component: 'DatePicker',
              parameters: { min: '2010-01-01' },
            },
          ],
        },
      },
    ]);
  });

  it('records the resolution, and clears the dates that were chosen under the old one', async () => {
    const harness = renderStageEditor(openEditor());
    const field = await openDateField(harness);

    fireEvent.change(field.getByLabelText('Earliest date'), {
      target: { value: '2020-01-01' },
    });
    await harness.user.selectOptions(
      field.getByRole('combobox', { name: 'Date resolution' }),
      'year',
    );

    // A full date is not a year, and re-deriving one would quietly widen a
    // window the researcher chose. So it goes — and is said to have gone.
    expect(
      await field.findByText(
        'The earliest and latest dates were cleared, because they were set at the previous resolution. Set them again if you still need them.',
      ),
    ).toBeVisible();
    await addRow(harness, field);

    const request = await harness.submit();
    expect(savedFields(request)).toEqual([
      {
        id: expect.any(String) as unknown as string,
        variable: 'met_on',
        component: 'DatePicker',
        parameters: { type: 'year' },
      },
    ]);
  });

  /**
   * The two date controls are told apart by name in schemas that are strict
   * about their own keys, so a `min` authored for one is a field the other
   * refuses outright. Changing the control therefore makes what was authored
   * for the old one meaningless rather than portable.
   */
  it('swaps the settings, and drops the old ones, when the control changes', async () => {
    const harness = renderStageEditor(openEditor());
    const field = await openDateField(harness);

    fireEvent.change(field.getByLabelText('Earliest date'), {
      target: { value: '2020-01-01' },
    });
    await harness.user.selectOptions(
      field.getByRole('combobox', { name: 'Input control' }),
      'RelativeDatePicker',
    );

    expect(field.queryByLabelText('Earliest date')).toBeNull();
    expect(
      field.queryByRole('combobox', { name: 'Date resolution' }),
    ).toBeNull();
    await harness.user.type(field.getByLabelText('Days before'), '30');
    await addRow(harness, field);

    const request = await harness.submit();
    expect(savedFields(request)).toEqual([
      {
        id: expect.any(String) as unknown as string,
        variable: 'met_on',
        component: 'RelativeDatePicker',
        // A number, not the string a number input reports: the schema takes
        // integers, and `"30"` would be refused after the dialog had closed.
        parameters: { before: 30 },
      },
    ]);
  });

  /**
   * The control follows the attribute, so moving the field to an attribute
   * nothing configurable can render takes the settings with it. Left behind,
   * they would be a block authored for a control the field no longer has.
   */
  it('takes the settings away when the field moves to an attribute whose control takes none', async () => {
    const harness = renderStageEditor(openEditor());
    const field = await openDateField(harness);

    fireEvent.change(field.getByLabelText('Earliest date'), {
      target: { value: '2020-01-01' },
    });
    await harness.user.selectOptions(
      field.getByRole('combobox', { name: 'Attribute' }),
      'age',
    );

    expect(field.queryByLabelText('Earliest date')).toBeNull();
    await addRow(harness, field);

    const request = await harness.submit();
    expect(savedFields(request)).toEqual([
      {
        id: expect.any(String) as unknown as string,
        variable: 'age',
        component: 'Number',
      },
    ]);
  });

  /**
   * The protocol's own parameter schema, run before the row is committed.
   *
   * Nothing downstream would take a reversed window either, but it would be
   * refused against a path once the dialog had closed — and the researcher
   * could no longer see which of the two dates was the problem.
   */
  it('refuses a window that ends before it starts, against the date that ends it', async () => {
    const harness = renderStageEditor(openEditor());
    const field = await openDateField(harness);

    fireEvent.change(field.getByLabelText('Earliest date'), {
      target: { value: '2024-01-01' },
    });
    fireEvent.change(field.getByLabelText('Latest date'), {
      target: { value: '2020-01-01' },
    });
    await harness.user.click(field.getByRole('button', { name: 'Add' }));

    expect(
      await field.findByText('DatePicker "min" must not be after "max"'),
    ).toBeVisible();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    const request = await harness.submit();
    expect(Object.hasOwn(request?.stageDocument ?? {}, 'nodeForm')).toBe(false);
  });

  /**
   * A block someone else authored is the researcher's work, and the editor
   * that now renders it must give it back exactly as it arrived — including
   * the resolution, which is stored at whatever precision it was chosen under
   * and can be coarser than anything this editor's date inputs would emit.
   */
  it('saves a stage whose fields already carry settings, unchanged', async () => {
    const { type, fields } = loadFixtureStage('network-composer-1');
    const harness = renderStageEditor({
      stage: {
        id: 'network-composer-settings',
        type,
        fields: {
          ...fields,
          nodeForm: {
            fields: [
              {
                id: 'composer-node-field-dated',
                variable: 'met_on',
                component: 'DatePicker',
                parameters: { type: 'month', min: '2020-01', max: '2024-12' },
              },
            ],
          },
        },
      },
      sections,
    });
    addPersonVariable(harness, 'met_on', { name: 'met_on', type: 'datetime' });

    const request = await harness.roundTrip({ unowned: ['label', 'subject'] });
    expect(savedFields(request)).toEqual([
      {
        id: 'composer-node-field-dated',
        variable: 'met_on',
        component: 'DatePicker',
        parameters: { type: 'month', min: '2020-01', max: '2024-12' },
      },
    ]);
  });
});
