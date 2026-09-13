import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { unvalidatedElsewhereMessage } from '../../../codebook/variableValidation.ts';
import {
  attributeField,
  chooseAttributeById,
  createRowIn,
  inventAttribute,
  offeredAttributes,
} from '../../../testing/attributePicker.ts';
import { readMessage } from '../../../testing/i18n.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import {
  addPersonVariable,
  addRow,
  composerHolding,
  edgeFormFieldsOf,
  edgesOf,
  highlightInASociogram,
  nodeFormFieldsOf,
  openRow,
  retypePersonVariable,
} from './composerFixtures.tsx';

const KNOWS_ENTRY = {
  id: 'composer-edge-1',
  subject: { entity: 'edge', type: 'knows' },
};

/**
 * The field one attribute is chosen in, by the label of the question it
 * answers.
 *
 * A scope rather than a control: every attribute here is picked in a window
 * the field's trigger opens, so everything a test does to a picker it does
 * through the field. The row's own field is labelled "Attribute", which no
 * other label on these sections is.
 */
const picker = (label: string): HTMLElement => attributeField(label);

/** The node form is a capability, so a stage that has none opens with it off. */
const switchOnNodeForm = async (
  harness: ReturnType<typeof renderStageEditor>,
) => {
  await harness.user.click(
    await screen.findByRole('switch', { name: 'Editable attributes' }),
  );
};

describe('what a network composer lets the participant build', () => {
  it('saves a stage whose connections and forms are configured, unchanged', async () => {
    const harness = renderStageEditor(
      composerHolding({
        convexHullVariable: 'contactType',
        nodeForm: {
          fields: [{ id: 'field-1', variable: 'age', component: 'Number' }],
        },
        edges: [
          {
            ...KNOWS_ENTRY,
            form: {
              fields: [
                {
                  id: 'edge-field-1',
                  variable: 'edgeNotes',
                  component: 'TextArea',
                },
              ],
            },
          },
        ],
      }),
    );

    const saved = await harness.roundTrip({
      unowned: ['label', 'subject', 'background'],
    });
    // Read back as well as compared: a round trip that agreed about an empty
    // document would otherwise pass.
    expect(nodeFormFieldsOf(saved.stageDocument)).toHaveLength(1);
    expect(
      edgeFormFieldsOf(edgesOf(saved.stageDocument)[0] ?? {}),
    ).toHaveLength(1);
  });

  it('shows the researcher what each of those forms asks', async () => {
    renderStageEditor(
      composerHolding({
        nodeForm: {
          fields: [
            {
              id: 'field-1',
              variable: 'age',
              component: 'Number',
              label: 'How old are they?',
            },
          ],
        },
        edges: [
          {
            ...KNOWS_ENTRY,
            form: {
              fields: [
                {
                  id: 'edge-field-1',
                  variable: 'edgeNotes',
                  component: 'TextArea',
                  label: 'Anything else?',
                },
              ],
            },
          },
        ],
      }),
    );

    expect(await screen.findByText('How old are they?')).toBeInTheDocument();
    expect(screen.getByText('Anything else?')).toBeInTheDocument();
    // Each list is named by the connection type it belongs to, so a researcher
    // reading two forms at once can tell which is which.
    expect(screen.getByText('Edge Attributes — knows')).toBeInTheDocument();
  });

  /**
   * A connection entry is more than the type it names: it carries an id of its
   * own, which is what the schema requires and what keeps the entry's own
   * questions with it across a reorder.
   */
  it('gives a newly drawable connection type an identity of its own', async () => {
    const harness = renderStageEditor(composerHolding({}));

    const dialog = await addRow(harness, 'Add a connection type');
    await harness.user.click(dialog.getByRole('radio', { name: 'knows' }));
    await harness.user.click(dialog.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const saved = await harness.submit();
    // Read whole rather than matched: a form key on an entry nobody has asked
    // a question of yet is a configured form holding nothing, which is not
    // what "the participant may draw this" means.
    expect(edgesOf(saved?.stageDocument ?? {})).toEqual([
      {
        id: expect.any(String) as unknown as string,
        subject: { entity: 'edge', type: 'knows' },
      },
    ]);
  });

  /**
   * The protocol schema refuses duplicate types in `edges`, and the interview
   * resolves a selected connection's form BY type — so a second entry for one
   * type would carry questions nothing could ever reach.
   */
  it('refuses a second entry for a connection type it already draws', async () => {
    const harness = renderStageEditor(
      composerHolding({ edges: [KNOWS_ENTRY] }),
    );

    const dialog = await addRow(harness, 'Add a connection type');
    await harness.user.click(dialog.getByRole('radio', { name: 'knows' }));
    await harness.user.click(dialog.getByRole('button', { name: 'Add' }));

    expect(
      await dialog.findByText(/already draws this kind of connection/),
    ).toBeInTheDocument();
    // The dialog stays open holding the draft, so the researcher can change it
    // rather than losing what they entered.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  /**
   * A row the researcher opens and leaves alone saves on the first Save.
   *
   * The dialog seeds every field from the row document, so a field restating
   * what the document already holds has nothing to add — and one restating it
   * as a fresh object re-registers itself on every render, which marks the
   * untouched row dirty and drops the submission the researcher just made.
   */
  it('closes on the first Save when an existing connection type is unchanged', async () => {
    const harness = renderStageEditor(
      composerHolding({ edges: [KNOWS_ENTRY] }),
    );

    const dialog = await openRow(harness, 'Edit connection type');
    // The row opens on what it holds, which is the whole of what a save
    // unchanged has to put back.
    expect(dialog.getByRole('radio', { name: 'knows' })).toBeChecked();
    await harness.user.click(dialog.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    const saved = await harness.submit();
    expect(edgesOf(saved?.stageDocument ?? {})).toEqual([KNOWS_ENTRY]);
  });

  /**
   * The list renders from the value rather than from the codebook, so a type a
   * collaborator deletes is still on screen and can still be taken out. Hidden,
   * the only way out would be deleting the whole stage.
   */
  it('shows a connection type the codebook has lost, so it can be taken out', async () => {
    renderStageEditor(
      composerHolding({
        edges: [
          { id: 'gone-1', subject: { entity: 'edge', type: 'former_edge' } },
        ],
      }),
    );

    expect(
      await screen.findByText(
        'former_edge — this edge type is no longer in the codebook',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Delete connection type' }),
    ).toBeEnabled();
  });

  /**
   * Removing an entry removes the questions asked about that kind of
   * connection, so it is asked about before it happens.
   */
  it('asks before a connection type goes, and keeps it when the answer is no', async () => {
    const harness = renderStageEditor(
      composerHolding({ edges: [KNOWS_ENTRY] }),
    );

    await harness.user.click(
      await screen.findByRole('button', { name: 'Delete connection type' }),
    );
    // The question names what is going, in the list's own noun.
    expect(
      await screen.findByText('Delete this connection type?'),
    ).toBeInTheDocument();
    await harness.user.click(
      await screen.findByRole('button', { name: 'Cancel' }),
    );

    // The row's own control and the confirmation's read the same now, so it is
    // the question that says the confirmation went — the row survives it.
    await waitFor(() =>
      expect(
        screen.queryByText('Delete this connection type?'),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole('button', { name: 'Delete connection type' }),
    ).toBeInTheDocument();
    const saved = await harness.submit();
    expect(edgesOf(saved?.stageDocument ?? {})).toHaveLength(1);
  });

  /**
   * A protocol authored elsewhere can hold two entries carrying the same `id`
   * — the schema refines `edges` for duplicate TYPES and says nothing about
   * ids — so a form addressed by id would land on both, giving the second
   * connection type questions naming attributes it does not have.
   */
  it('writes a form into the connection type it belongs to, and no other', async () => {
    const harness = renderStageEditor(
      composerHolding({
        edges: [
          { id: 'shared', subject: { entity: 'edge', type: 'knows' } },
          { id: 'shared', subject: { entity: 'edge', type: 'family_edge' } },
        ],
      }),
    );

    await harness.user.click(
      await screen.findByRole('button', {
        name: 'Create new attribute for knows',
      }),
    );
    const dialog = within(await screen.findByRole('dialog'));
    await chooseAttributeById(harness.user, picker('Attribute'), 'edgeNotes');
    await harness.user.click(dialog.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const saved = await harness.submit();
    const entries = edgesOf(saved?.stageDocument ?? {});
    expect(edgeFormFieldsOf(entries[0] ?? {})).toHaveLength(1);
    expect(edgeFormFieldsOf(entries[1] ?? {})).toHaveLength(0);
  });

  /**
   * A form with nothing in it is spelled by the key not being there. An empty
   * one says something else — a configured form holding nothing — which the
   * researcher did not author.
   */
  it('takes a connection’s form away when its last question goes', async () => {
    const harness = renderStageEditor(
      composerHolding({
        edges: [
          {
            ...KNOWS_ENTRY,
            form: {
              fields: [
                {
                  id: 'edge-field-1',
                  variable: 'edgeNotes',
                  component: 'TextArea',
                },
              ],
            },
          },
        ],
      }),
    );

    await harness.user.click(
      await screen.findByRole('button', { name: 'Delete form field' }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Delete form field' }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Delete form field' }),
      ).not.toBeInTheDocument(),
    );

    const saved = await harness.submit();
    expect(edgesOf(saved?.stageDocument ?? {})[0]).not.toHaveProperty('form');
  });

  /**
   * The control belongs to the FIELD here rather than to the codebook
   * attribute, which is the whole point of this interface — but it starts from
   * the codebook's own answer, because that is what the researcher already
   * decided the attribute looks like everywhere else.
   */
  it('asks something about each node, with the control the attribute already uses', async () => {
    const harness = renderStageEditor(composerHolding({}));
    await switchOnNodeForm(harness);

    const dialog = await addRow(harness, 'Create new node attribute');
    await chooseAttributeById(
      harness.user,
      picker('Attribute'),
      'composerName',
    );
    await waitFor(() =>
      expect(
        dialog.getByRole('combobox', { name: 'Input control' }),
      ).toHaveValue('Text'),
    );
    await harness.user.selectOptions(
      dialog.getByRole('combobox', { name: 'Input control' }),
      'TextArea',
    );
    await harness.user.type(
      dialog.getByRole('textbox', { name: 'Question' }),
      'Who?',
    );
    await harness.user.click(dialog.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const saved = await harness.submit();
    // Read whole: a hint switch the researcher never touched is written by its
    // absence, and a field carrying `showValidationHints: false` says nothing
    // its absence did not already say.
    expect(nodeFormFieldsOf(saved?.stageDocument ?? {})).toEqual([
      {
        id: expect.any(String) as unknown as string,
        variable: 'composerName',
        component: 'TextArea',
        label: 'Who?',
      },
    ]);
    // And the codebook is untouched: the same attribute goes on being a single
    // line box wherever else the protocol asks for it.
    expect(
      harness.hostCodebook().node?.person?.variables?.composerName,
    ).toMatchObject({ component: 'Text' });
  });

  /**
   * The grouping is written straight onto the node as the participant lassoes
   * and taps, and a form field collects through the codebook's rules. Two
   * writers of opposite classes on one attribute is what the schema's own
   * role-conflict rule refuses.
   */
  it('stops offering the grouping attribute to the node form', async () => {
    const harness = renderStageEditor(
      composerHolding({
        convexHullVariable: 'contactType',
        nodeForm: { fields: [] },
      }),
    );
    await switchOnNodeForm(harness);

    await addRow(harness, 'Create new node attribute');
    const offered = await offeredAttributes(harness.user, picker('Attribute'));
    expect(offered).not.toContain('contactType');
    // And something nothing on this stage claims still is, so the case is
    // about the grouping rather than about an empty list.
    expect(offered).toContain('age');
  });

  /**
   * And the grouping picked in THIS edit, which nothing has saved yet: the
   * row's picker reads the stage form as well as the protocol, so an attribute
   * the researcher chose as the grouping a moment ago is already out of the
   * list a form field is chosen from — before either half of the conflict
   * reaches the protocol for the schema to refuse.
   */
  it('stops offering a grouping attribute chosen in this edit', async () => {
    const harness = renderStageEditor(
      composerHolding({ nodeForm: { fields: [] } }),
    );
    // An attribute NO stage in the protocol claims, so the only thing that can
    // take it out of the form's list is the pick made here. The fixture's two
    // categorical attributes are each claimed by a bin stage already, which
    // would leave the case passing whether the grouping was picked or not.
    addPersonVariable(harness, 'circle', {
      name: 'circle',
      type: 'categorical',
      options: [
        { label: 'Inner', value: 'inner' },
        { label: 'Outer', value: 'outer' },
      ],
    });

    const grouping = await waitFor(() =>
      picker('Create or select a categorical attribute for grouping'),
    );
    await waitFor(async () =>
      expect(await offeredAttributes(harness.user, grouping)).toContain(
        'circle',
      ),
    );
    await chooseAttributeById(harness.user, grouping, 'circle');
    await switchOnNodeForm(harness);

    await addRow(harness, 'Create new node attribute');
    const offered = await offeredAttributes(harness.user, picker('Attribute'));
    expect(offered).not.toContain('circle');
    // And something nothing on this stage claims still is, so the case is
    // about the pick rather than about an empty list.
    expect(offered).toContain('age');
  });

  it('stops offering an attribute the node form collects to the grouping', async () => {
    const harness = renderStageEditor(
      composerHolding({
        nodeForm: {
          fields: [
            {
              id: 'field-1',
              variable: 'contactType',
              component: 'CheckboxGroup',
            },
          ],
        },
      }),
    );
    // A second attribute of the same kind, so the list still has something in
    // it: the case is about what the grouping stops offering, not about a
    // control with nothing to offer at all.
    addPersonVariable(harness, 'circle', {
      name: 'circle',
      type: 'categorical',
      options: [
        { label: 'Inner', value: 'inner' },
        { label: 'Outer', value: 'outer' },
      ],
    });

    const grouping = await waitFor(() =>
      picker('Create or select a categorical attribute for grouping'),
    );
    await waitFor(async () =>
      expect(await offeredAttributes(harness.user, grouping)).toContain(
        'circle',
      ),
    );
    expect(await offeredAttributes(harness.user, grouping)).not.toContain(
      'contactType',
    );
  });

  /**
   * A protocol can ARRIVE holding two fields on one attribute — an import, a
   * migration, an older tool — and the schema's own `uniqueFormFieldVariables`
   * refuses it. The picker cannot catch that one: it offers back whatever the
   * row is holding, because a picker that dropped its own value would blank
   * the control and write the blank over the reference the researcher has to
   * resolve. So the save does.
   */
  it('refuses a field that arrived recording what a sibling already records', async () => {
    const harness = renderStageEditor(
      composerHolding({
        nodeForm: {
          fields: [
            { id: 'field-1', variable: 'age', component: 'Number' },
            { id: 'field-2', variable: 'age', component: 'Number' },
          ],
        },
      }),
    );

    const dialog = await openRow(harness, 'Edit form field', 1);
    await harness.user.type(
      dialog.getByRole('textbox', { name: 'Question' }),
      'How old?',
    );
    await harness.user.click(dialog.getByRole('button', { name: 'Save' }));

    expect(
      await dialog.findByText(/Another field on this form already records/),
    ).toBeInTheDocument();
    // The dialog stays open holding the draft, so the researcher can repoint
    // the field rather than losing what they wrote.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  /**
   * The attribute a form field asks for, invented in the row itself.
   *
   * This row names no kind of answer, because the input control it chooses IS
   * the kind: Architect derives one from the other here and nowhere else
   * (`EditableAttributesList/ComposerAttributeFields` through
   * `useComposerFieldCommit`'s `getTypeForComponent`). So the create row keeps
   * the name on the row, the control decides what the attribute will be, and
   * the row's own save writes it.
   */
  it('creates the attribute a form field records, from its picker', async () => {
    const harness = renderStageEditor(
      composerHolding({ nodeForm: { fields: [] } }),
    );
    await switchOnNodeForm(harness);

    const dialog = await addRow(harness, 'Create new node attribute');
    await inventAttribute(harness.user, picker('Attribute'), 'favouriteFood');

    // Nothing written yet: which control collects it is the next question, and
    // the codebook refuses an attribute with no kind of answer.
    expect(
      Object.values(harness.hostCodebook().node?.person?.variables ?? {}).some(
        (variable) => variable.name === 'favouriteFood',
      ),
    ).toBe(false);
    // The picker shows what the row is making, so the researcher can see that
    // their name was taken.
    await waitFor(() =>
      expect(
        within(picker('Attribute')).getByText('favouriteFood'),
      ).toBeVisible(),
    );

    // Every control a form can offer, in the order the kinds of answer are
    // offered in: there is no attribute yet to narrow the list by, and
    // narrowing it to the kind the current control implies would take away
    // every other kind the researcher might have meant.
    const control = await dialog.findByRole('combobox', {
      name: 'Input control',
    });
    expect(
      within(control)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual([
      'Select an option…',
      'Text input',
      'Text area',
      'Number input',
      'Yes or no buttons',
      'Toggle',
      'Radio group',
      'Likert scale',
      'Checkbox group',
      'Toggle button group',
      'Visual analogue scale',
      'Date picker',
      'Relative date picker',
    ]);
    // Unanswered, because the control is the question this row asks: seeded
    // with one, the researcher would have made a choice they were never
    // offered — and it is the choice that decides the kind of answer.
    expect(control).toHaveValue('');

    await harness.user.selectOptions(control, 'Number');
    // Said while it can still be changed, because once the attribute exists it
    // cannot be.
    expect(
      await dialog.findByText(/defined as type/, { exact: false }),
    ).toHaveTextContent('Number');

    await harness.user.click(dialog.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    // In the codebook, under a record key the researcher never sees — so it is
    // looked up by the name they typed, and read whole, because the kind the
    // control decided is the half a name could not say. The control goes with
    // it: a composer field owns its own from then on, and this is the one
    // write that gives the attribute one at all.
    const created = await waitFor(() => {
      const variables = harness.hostCodebook().node?.person?.variables ?? {};
      const entry = Object.entries(variables).find(
        ([, variable]) => variable.name === 'favouriteFood',
      );
      if (entry === undefined) {
        throw new Error('the codebook has no “favouriteFood” attribute');
      }
      return entry;
    });
    expect(created[1]).toMatchObject({
      name: 'favouriteFood',
      type: 'number',
      component: 'Number',
    });

    const saved = await harness.submit();
    expect(nodeFormFieldsOf(saved?.stageDocument ?? {})).toEqual([
      {
        id: expect.any(String) as unknown as string,
        variable: created[0],
        component: 'Number',
      },
    ]);
  });

  /**
   * The rules an invented answer has to satisfy, authored beside the control
   * that decides its kind and written with the create.
   *
   * Architect writes them with the create for the same reason
   * (`Form/fieldCommit.ts:168-172`): a researcher who has just said this
   * answer is required said it about the attribute being made, and asking them
   * to save, reopen and come back is asking them to trust that it happened.
   */
  it('writes the rules an invented attribute was given, with the create', async () => {
    const harness = renderStageEditor(
      composerHolding({ nodeForm: { fields: [] } }),
    );
    await switchOnNodeForm(harness);

    const dialog = await addRow(harness, 'Create new node attribute');
    await inventAttribute(harness.user, picker('Attribute'), 'favouriteFood');
    await harness.user.selectOptions(
      await dialog.findByRole('combobox', { name: 'Input control' }),
      'Text',
    );

    await harness.user.click(
      await dialog.findByRole('button', { name: 'Set rules for this answer' }),
    );
    await harness.user.click(
      await screen.findByRole('checkbox', { name: 'Required answer' }),
    );
    await harness.user.click(screen.getByRole('button', { name: 'Save' }));

    // Still nothing in the codebook: the rules are held on the row until the
    // create they belong to.
    expect(
      Object.values(harness.hostCodebook().node?.person?.variables ?? {}).some(
        (variable) => variable.name === 'favouriteFood',
      ),
    ).toBe(false);

    await harness.user.click(dialog.getByRole('button', { name: 'Add' }));

    const created = await waitFor(() => {
      const variables = harness.hostCodebook().node?.person?.variables ?? {};
      const entry = Object.values(variables).find(
        (variable) => variable.name === 'favouriteFood',
      );
      if (entry === undefined) {
        throw new Error('the codebook has no “favouriteFood” attribute');
      }
      return entry;
    });
    expect(created).toMatchObject({
      type: 'text',
      validation: { required: true },
    });
  });

  /**
   * A list of answers IS its values, and the schema refuses fewer than two of
   * them — so a control that makes one cannot be finished from a name and a
   * control alone. Said in the package's own words, under the control that
   * decided the kind, rather than left to the schema.
   */
  it('refuses to invent a list of answers from the control alone', async () => {
    const harness = renderStageEditor(
      composerHolding({ nodeForm: { fields: [] } }),
    );
    await switchOnNodeForm(harness);

    const dialog = await addRow(harness, 'Create new node attribute');
    await inventAttribute(harness.user, picker('Attribute'), 'favouriteFood');
    await harness.user.selectOptions(
      await dialog.findByRole('combobox', { name: 'Input control' }),
      'CheckboxGroup',
    );
    await harness.user.click(dialog.getByRole('button', { name: 'Add' }));

    expect(
      await screen.findByText(
        'Create this attribute and the values it offers before adding the field that collects it.',
      ),
    ).toBeInTheDocument();
    expect(
      Object.values(harness.hostCodebook().node?.person?.variables ?? {}).some(
        (variable) => variable.name === 'favouriteFood',
      ),
    ).toBe(false);
  });

  /**
   * The typed name is judged against everything the type already records,
   * rather than against what this picker offers: a name the canvas's own
   * position attribute holds is taken just as firmly as one a text attribute
   * holds, and the codebook would refuse it after a round trip nobody needs.
   */
  it('says a form field cannot invent a name the type already holds', async () => {
    const harness = renderStageEditor(
      composerHolding({ nodeForm: { fields: [] } }),
    );
    await switchOnNodeForm(harness);
    await addRow(harness, 'Create new node attribute');

    // A position attribute: named on this type, and never offered here,
    // because no control can ask a participant for one.
    expect(
      await createRowIn(
        harness.user,
        picker('Attribute'),
        'Find or create an attribute',
        (term) =>
          `Cannot create attribute named “${term}”: this type already has an attribute called that`,
        'layout',
      ),
    ).not.toBeNull();
  });

  /** The attribute is created and bound without the researcher leaving. */
  it('creates a position attribute without leaving the stage', async () => {
    const harness = renderStageEditor(composerHolding({ layoutVariable: '' }));

    await harness.opened();
    await inventAttribute(
      harness.user,
      picker('Create or select an attribute to store node coordinates'),
      'placedAt',
    );

    // Bound here, not merely created: the researcher asked for it from this
    // control, so finding it in a list that has just grown is not the answer.
    // Read off the field itself: what it SHOWS is the attribute it holds.
    await waitFor(() =>
      expect(
        within(
          picker('Create or select an attribute to store node coordinates'),
        ).getByText('placedAt'),
      ).toBeVisible(),
    );
  });

  /**
   * The attribute every node this composer adds is stamped with, invented from
   * the same control that binds it. A name finishes a text attribute, so this
   * one is written straight to the codebook.
   */
  it('creates the attribute a quick-added node is named in', async () => {
    const harness = renderStageEditor(composerHolding({ quickAdd: '' }));

    await harness.opened();
    await inventAttribute(
      harness.user,
      picker('Create or select an attribute for the quick-add form'),
      'calledThem',
    );

    const created = await waitFor(() => {
      const entry = Object.entries(
        harness.hostCodebook().node?.person?.variables ?? {},
      ).find(([, variable]) => variable.name === 'calledThem');
      if (entry === undefined) throw new Error('the attribute was not created');
      return entry;
    });
    expect(created[1].type).toBe('text');
    await waitFor(() =>
      expect(
        within(
          picker('Create or select an attribute for the quick-add form'),
        ).getByText('calledThem'),
      ).toBeVisible(),
    );
  });

  /**
   * And the grouping attribute, which a name cannot finish: the groups ARE its
   * values, and the schema refuses fewer than two of them. So this create row
   * opens the codebook's own editor on the typed name rather than writing
   * anything, which is the second of Architect's two create shapes.
   */
  it('sends a grouping attribute to the editor that authors its groups', async () => {
    const harness = renderStageEditor(composerHolding({}));

    await harness.opened();
    await inventAttribute(
      harness.user,
      picker('Create or select a categorical attribute for grouping'),
      'circle',
    );

    // Nothing written yet, and the editor holding the name the researcher
    // typed: a list of groups is what it is open to ask for.
    expect(
      await screen.findByRole('textbox', { name: 'Attribute name' }),
    ).toHaveValue('circle');
    expect(
      Object.values(harness.hostCodebook().node?.person?.variables ?? {}).some(
        (variable) => variable.name === 'circle',
      ),
    ).toBe(false);
  });

  /**
   * A composer's list is the only place a researcher meets connection types
   * while building one, so a protocol with none — or none of the kind this
   * study needs — would otherwise send them to the codebook and back with the
   * stage half-configured. Architect's own composer has always offered this.
   */
  it('creates a connection type without leaving the stage, and draws it', async () => {
    const harness = renderStageEditor(composerHolding({}));

    const dialog = await addRow(harness, 'Add a connection type');
    await harness.user.click(
      await dialog.findByRole('button', { name: 'Create new edge type' }),
    );
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Edge type name' }),
      'livesWith',
    );
    await harness.user.click(
      screen.getByRole('button', { name: 'Save entity' }),
    );
    // Chosen on the row as it is created, which is what makes the row worth
    // saving — the researcher asked for a type to draw here, not for one in a
    // list that has just grown.
    expect(
      await dialog.findByRole('radio', { name: 'livesWith' }),
    ).toBeChecked();
    await harness.user.click(dialog.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    // In the codebook, because that is where a type lives — under the id the
    // HOST minted, which is the id the stage then has to be naming.
    const created = Object.entries(harness.hostCodebook().edge ?? {}).find(
      ([, definition]) => definition.name === 'livesWith',
    );
    expect(created).toBeDefined();
    // ...and drawable here, because that is what the researcher asked for:
    // finding it in a list that has just grown is not the answer.
    const saved = await harness.submit();
    expect(edgesOf(saved?.stageDocument ?? {})).toEqual([
      {
        id: expect.any(String) as unknown as string,
        subject: { entity: 'edge', type: created?.[0] },
      },
    ]);
  });

  /**
   * Node and edge types share one namespace, so a connection judged against
   * the edge names alone could be given a node type's name — and the refusal
   * would arrive from the protocol schema after the researcher had finished
   * the dialog, with no name field for it to sit under.
   */
  it('refuses a connection-type name a node type already uses', async () => {
    const harness = renderStageEditor(composerHolding({}));

    const dialog = await addRow(harness, 'Add a connection type');
    await harness.user.click(
      await dialog.findByRole('button', { name: 'Create new edge type' }),
    );
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Edge type name' }),
      'Person',
    );
    await harness.user.click(
      screen.getByRole('button', { name: 'Save entity' }),
    );

    expect(
      await screen.findByText('A type named "Person" already exists.'),
    ).toBeInTheDocument();
    expect(
      Object.values(harness.hostCodebook().edge ?? {}).map(({ name }) => name),
    ).toEqual(['family_edge', 'knows']);
  });
});

/**
 * Where the create row is offered, and where it is not.
 *
 * This row's create is finished in the codebook's own editor, so it is offered
 * exactly where that editor can be opened. The two cases are asked of the same
 * control with the same words, so a term or a label this suite got wrong would
 * fail the first of them rather than pass the second for the wrong reason.
 */
describe('inventing the attribute a connection form records', () => {
  const SEARCH_LABEL = 'Find or create an attribute';
  const createRowName = (term: string) =>
    `Create new attribute called “${term}”.`;

  /** A composer whose one connection form already asks something. */
  const askingAbout = (type: string) =>
    composerHolding({
      edges: [
        {
          id: 'composer-edge-1',
          subject: { entity: 'edge', type },
          form: {
            fields: [
              { id: 'field-1', variable: 'edgeNotes', component: 'TextArea' },
            ],
          },
        },
      ],
    });

  const createRowOfTheOpenRow = async (
    harness: ReturnType<typeof renderStageEditor>,
  ): Promise<HTMLElement | null> => {
    await openRow(harness, 'Edit form field');
    return createRowIn(
      harness.user,
      picker('Attribute'),
      SEARCH_LABEL,
      createRowName,
      'howOften',
    );
  };

  it('offers it on the connection type the codebook holds', async () => {
    expect(
      await createRowOfTheOpenRow(renderStageEditor(askingAbout('knows'))),
    ).not.toBeNull();
  });

  /**
   * A connection type a collaborator has deleted has no codebook section to
   * add an attribute to, so no editor can open on the typed name — and the
   * picker's rule is that a create row exists exactly where a create does. The
   * form is still reachable, because it is still on screen to be taken out.
   */
  it('offers none on a connection type the codebook has lost', async () => {
    expect(
      await createRowOfTheOpenRow(
        renderStageEditor(askingAbout('former_edge')),
      ),
    ).toBeNull();
  });
});

/**
 * A form field collects its answer through the codebook's own rules, so it may
 * not record an attribute something else writes around them.
 *
 * The row's picker enforces that by never offering such an attribute, and the
 * protocol is read live: a collaborator turning the attribute into an
 * unvalidated write while the dialog is open drops it from the option list and
 * leaves the pick sitting in the row. Nothing then refused it, so Save
 * committed a field the protocol reports as a writer conflict.
 */
describe('an attribute another stage starts writing mid-edit', () => {
  it('refuses the field rather than closing on the conflict', async () => {
    const harness = renderStageEditor(composerHolding({}));
    await switchOnNodeForm(harness);

    const dialog = await addRow(harness, 'Create new node attribute');
    // The fixture's marking prompt already claims `highlighted`, so the picker
    // is not offering it — which is what makes the same picker offering it a
    // moment later the collaborator's change ARRIVING rather than a guess.
    expect(
      await offeredAttributes(harness.user, picker('Attribute')),
    ).not.toContain('highlighted');
    await chooseAttributeById(harness.user, picker('Attribute'), 'flagged');

    highlightInASociogram(harness, 'flagged');
    // Waited for rather than assumed: a save clicked before the change lands
    // is refused by nothing, which is the defect this test exists for. The
    // picker goes on offering `flagged` throughout — a picker that dropped the
    // value the row is holding would blank the control and write the blank
    // over the reference the researcher has to resolve — so the row's own gate
    // is the only thing left that can refuse it.
    await waitFor(async () =>
      expect(
        await offeredAttributes(harness.user, picker('Attribute')),
      ).toContain('highlighted'),
    );
    expect(
      await offeredAttributes(harness.user, picker('Attribute')),
    ).toContain('flagged');
    await harness.user.click(dialog.getByRole('button', { name: 'Add' }));

    // The dialog staying open IS the refusal, and the reason is the one the
    // codebook editor gives for the same conflict — read back through the same
    // decode the render site uses, because it travels encoded on a
    // plain-string contract.
    await dialog.findByText(
      readMessage(unvalidatedElsewhereMessage('flagged')),
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  /**
   * And the row that ARRIVED on such an attribute saves again untouched.
   *
   * The gate judges the pick this edit made against the pick the row opened
   * on, so a conflict the researcher did not make here is reported against the
   * protocol rather than trapped in this dialog. Refused, a field authored
   * before another stage claimed its attribute could never have anything else
   * about it changed — the researcher would have to delete it to edit it.
   */
  it('saves a field that arrived on such an attribute, untouched', async () => {
    const harness = renderStageEditor(
      composerHolding({
        nodeForm: {
          fields: [
            { id: 'field-1', variable: 'highlighted', component: 'Boolean' },
          ],
        },
      }),
    );

    const dialog = await openRow(harness, 'Edit form field');
    await harness.user.click(dialog.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    const saved = await harness.submit();
    expect(nodeFormFieldsOf(saved?.stageDocument ?? {})[0]).toEqual({
      id: 'field-1',
      variable: 'highlighted',
      component: 'Boolean',
    });
  });
});

/**
 * The pairing a composer field carries is judged against the attribute as the
 * protocol holds it NOW.
 *
 * The control follows the attribute, but only while the researcher is the one
 * changing it: the effect that re-pairs them watches the row's own pick, and a
 * collaborator retyping the attribute underneath the open row does not move
 * it. The control list re-derives and the row goes on holding a control that
 * cannot ask for the attribute — a pairing `validateComposerFieldComponents`
 * refuses, reported against a path in the saved protocol rather than against
 * the control the researcher has to change.
 */
describe('an attribute a collaborator retypes mid-edit', () => {
  it('refuses a control that can no longer ask for it', async () => {
    const harness = renderStageEditor(composerHolding({}));
    await switchOnNodeForm(harness);

    const dialog = await addRow(harness, 'Create new node attribute');
    await chooseAttributeById(harness.user, picker('Attribute'), 'age');
    const control = await dialog.findByRole('combobox', {
      name: 'Input control',
    });
    // A number attribute arrives paired with the one control that can ask for
    // a number, which is what makes the pairing below the collaborator's doing.
    await waitFor(() => expect(control).toHaveValue('Number'));

    retypePersonVariable(harness, 'age', 'text');
    // Waited for rather than assumed: a save clicked before the change lands
    // is refused by nothing, which is the defect this test exists for. What
    // arrives is the list of controls a text attribute may be asked with — the
    // row's own `Number` is not among them, so the select has nothing to show.
    await within(control).findByRole('option', { name: 'Text input' });
    expect(
      within(control).queryByRole('option', { name: 'Number input' }),
    ).toBeNull();

    await harness.user.click(dialog.getByRole('button', { name: 'Add' }));

    // On the control rather than above the fields: it is the control the
    // researcher has to change, and a refusal that named no control would
    // leave them looking for it.
    await waitFor(() =>
      expect(control).toHaveAttribute('aria-invalid', 'true'),
    );
    expect(
      dialog.getByText(/cannot be asked for with this input control/),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Changed to a control the attribute CAN be asked with, the field saves —
    // and what reaches the stage is that control rather than the stale one.
    await harness.user.selectOptions(control, 'Text');
    await harness.user.click(dialog.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const saved = await harness.submit();
    expect(nodeFormFieldsOf(saved?.stageDocument ?? {})).toEqual([
      {
        id: expect.any(String) as unknown as string,
        variable: 'age',
        component: 'Text',
      },
    ]);
  });
});

/**
 * What a valid answer looks like, shown to the participant beneath the field.
 *
 * Off is the schema's own default, so it is written by the key's absence: a
 * field stamped `showValidationHints: false` says nothing its absence did not
 * already say, and every field of every form would carry it.
 */
describe('validation hints on a composer form field', () => {
  const fieldOn = (variable: string) =>
    composerHolding({
      nodeForm: {
        fields: [{ id: 'field-1', variable, component: 'Number' }],
      },
    });

  it('records them being switched on, and takes the key away again', async () => {
    const harness = renderStageEditor(fieldOn('age'));

    const dialog = await openRow(harness, 'Edit form field');
    await harness.user.click(
      dialog.getByRole('switch', { name: 'Show validation hints' }),
    );
    await harness.user.click(dialog.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const on = await harness.submit();
    expect(nodeFormFieldsOf(on?.stageDocument ?? {})[0]).toEqual({
      id: 'field-1',
      variable: 'age',
      component: 'Number',
      showValidationHints: true,
    });

    const back = await openRow(harness, 'Edit form field');
    await harness.user.click(
      back.getByRole('switch', { name: 'Show validation hints' }),
    );
    await harness.user.click(back.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const off = await harness.submit();
    expect(nodeFormFieldsOf(off?.stageDocument ?? {})[0]).toEqual({
      id: 'field-1',
      variable: 'age',
      component: 'Number',
    });
  });
});

describe('what a composer field’s control accepts', () => {
  const DATE_ATTRIBUTE = 'metOn';

  const openWithADate = () => {
    const harness = renderStageEditor(
      composerHolding({
        nodeForm: {
          fields: [
            {
              id: 'field-1',
              variable: DATE_ATTRIBUTE,
              component: 'DatePicker',
              parameters: { type: 'full', min: '2020-01-01' },
            },
          ],
        },
      }),
    );
    addPersonVariable(harness, DATE_ATTRIBUTE, {
      name: DATE_ATTRIBUTE,
      type: 'datetime',
      component: 'DatePicker',
      parameters: { type: 'full' },
    });
    return harness;
  };

  /**
   * `component` and `parameters` are the composer FIELD's, so the same
   * attribute can be a plain picker bounded by two dates on this form and a
   * relative window on the next. Written to the codebook they would be
   * authored against a control the codebook does not have, and the variable
   * schemas — split on `component` — refuse that pairing outright.
   */
  it('saves a stage whose fields already carry settings, unchanged', async () => {
    const harness = openWithADate();
    await screen.findByText(DATE_ATTRIBUTE);

    const saved = await harness.roundTrip({
      unowned: ['label', 'subject', 'background', 'quickAdd', 'layoutVariable'],
    });
    expect(nodeFormFieldsOf(saved.stageDocument)[0]).toMatchObject({
      parameters: { type: 'full', min: '2020-01-01' },
    });
    // Nothing reached the codebook attribute's own block.
    expect(
      harness.hostCodebook().node?.person?.variables?.[DATE_ATTRIBUTE],
    ).toMatchObject({ parameters: { type: 'full' } });
  });

  /**
   * A window with no dates in it is a control the participant can answer
   * nothing with, and the protocol schema refuses it — so the field says so
   * where it was written rather than letting the row close on it.
   *
   * Against the date that ENDS the window, which is the control the researcher
   * has to change, and in this package's own words: the schema's sentence
   * names a control and two keys, none of them on screen, and is hard-coded
   * English no catalog translates.
   */
  it('refuses a window that ends before it starts, against the date that ends it', async () => {
    const harness = openWithADate();
    await screen.findByText(DATE_ATTRIBUTE);

    const dialog = await openRow(harness, 'Edit form field');
    fireEvent.change(dialog.getByLabelText('Latest date'), {
      target: { value: '2019-01-01' },
    });
    await harness.user.click(dialog.getByRole('button', { name: 'Save' }));

    const latest = dialog
      .getByLabelText('Latest date')
      .closest('[data-field-name]') as HTMLElement;
    expect(
      await within(latest).findByText(
        'The latest date cannot be earlier than the earliest date.',
      ),
    ).toBeVisible();
    // The row is still on screen holding the draft, rather than committed.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  /**
   * The two date schemas are strict about their own keys, so a `min` beside a
   * relative picker is a field the protocol refuses outright. A control change
   * therefore takes what was authored for the old control with it.
   */
  it('swaps the settings, and drops the old ones, when the control changes', async () => {
    const harness = openWithADate();
    await screen.findByText(DATE_ATTRIBUTE);

    const dialog = await openRow(harness, 'Edit form field');
    await harness.user.selectOptions(
      dialog.getByRole('combobox', { name: 'Input control' }),
      'RelativeDatePicker',
    );
    await harness.user.click(dialog.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const saved = await harness.submit();
    const field = nodeFormFieldsOf(saved?.stageDocument ?? {})[0];
    expect(field).toMatchObject({ component: 'RelativeDatePicker' });
    expect(field?.parameters).toBeUndefined();
  });

  /**
   * A field with no block of its own runs on the codebook attribute's — the
   * interview reads `field.parameters ?? variable.parameters` — and that is a
   * live relationship. Opening the row and saving it untouched must not turn
   * the inheritance into a frozen copy of itself.
   */
  it('shows what a field inherits, and saves it without a block of its own', async () => {
    const harness = renderStageEditor(
      composerHolding({
        nodeForm: {
          fields: [
            {
              id: 'field-1',
              variable: DATE_ATTRIBUTE,
              component: 'DatePicker',
            },
          ],
        },
      }),
    );
    addPersonVariable(harness, DATE_ATTRIBUTE, {
      name: DATE_ATTRIBUTE,
      type: 'datetime',
      component: 'DatePicker',
      parameters: { type: 'year' },
    });
    await screen.findByText(DATE_ATTRIBUTE);

    const dialog = await openRow(harness, 'Edit form field');
    expect(
      await dialog.findByText(
        /These come from the “metOn” attribute, and this field follows them/,
      ),
    ).toBeInTheDocument();
    await harness.user.click(dialog.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const saved = await harness.submit();
    expect(
      nodeFormFieldsOf(saved?.stageDocument ?? {})[0]?.parameters,
    ).toBeUndefined();
  });
});

/**
 * The live preview beside a composer field's own controls.
 *
 * The same pane as the shared form family's, in the other of its two modes: a
 * composer field labels one box of a form the participant is filling in rather
 * than asking a question, and the control it renders with is the STAGE's
 * rather than the attribute's.
 */
describe('the live preview beside a composer form field', () => {
  const fieldOnAge = () =>
    composerHolding({
      nodeForm: {
        fields: [{ id: 'field-1', variable: 'age', component: 'Number' }],
      },
    });

  it('offers the controls and the preview as two named regions', async () => {
    const harness = renderStageEditor(fieldOnAge());

    await openRow(harness, 'Edit form field');
    const dialog = within(
      screen.getByRole('dialog', { name: 'Edit form field' }),
    );

    expect(dialog.getByRole('form', { name: 'Configuration' })).toBeVisible();
    expect(
      dialog.getByRole('region', { name: 'Interactive preview' }),
    ).toBeVisible();
  });

  it('names the previewed box by the label being typed, and follows the control', async () => {
    const harness = renderStageEditor(fieldOnAge());

    const dialog = await openRow(harness, 'Edit form field');
    const preview = within(
      dialog.getByRole('region', { name: 'Interactive preview' }),
    );
    // No label authored yet, so the attribute's own name stands in — the
    // composer's rule, and never the form family's placeholder question.
    expect(preview.getByRole('spinbutton', { name: 'age' })).toBeVisible();

    await harness.user.type(
      dialog.getByRole('textbox', { name: 'Question' }),
      'How old are they?',
    );
    await waitFor(() =>
      expect(
        preview.getByRole('spinbutton', { name: 'How old are they?' }),
      ).toBeVisible(),
    );
  });
});
