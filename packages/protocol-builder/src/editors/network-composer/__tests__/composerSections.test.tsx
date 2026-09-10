import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { unvalidatedElsewhereMessage } from '../../../codebook/variableValidation.ts';
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

/** The node form is a capability, so a stage that has none opens with it off. */
const switchOnNodeForm = async (
  harness: ReturnType<typeof renderStageEditor>,
) => {
  await harness.user.click(
    await screen.findByRole('switch', { name: 'Node attributes' }),
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
    expect(
      screen.getByText('Attributes for “knows” connections'),
    ).toBeInTheDocument();
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
        name: 'Create new attribute field for “knows” connections',
      }),
    );
    const dialog = within(await screen.findByRole('dialog'));
    await harness.user.selectOptions(
      dialog.getByRole('combobox', { name: 'Attribute' }),
      'edgeNotes',
    );
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

    const dialog = await addRow(harness, 'Create new node attribute field');
    await harness.user.selectOptions(
      dialog.getByRole('combobox', { name: 'Attribute' }),
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

    const dialog = await addRow(harness, 'Create new node attribute field');
    expect(
      dialog.queryByRole('option', { name: 'contactType' }),
    ).not.toBeInTheDocument();
    // And something nothing on this stage claims still is, so the case is
    // about the grouping rather than about an empty list.
    expect(dialog.getByRole('option', { name: 'age' })).toBeInTheDocument();
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

    const grouping = await screen.findByRole('combobox', {
      name: 'Grouping attribute',
    });
    await waitFor(() =>
      expect(
        within(grouping).getByRole('option', { name: 'circle' }),
      ).toBeInTheDocument(),
    );
    await harness.user.selectOptions(grouping, 'circle');
    await switchOnNodeForm(harness);

    const dialog = await addRow(harness, 'Create new node attribute field');
    expect(
      dialog.queryByRole('option', { name: 'circle' }),
    ).not.toBeInTheDocument();
    // And something nothing on this stage claims still is, so the case is
    // about the pick rather than about an empty list.
    expect(dialog.getByRole('option', { name: 'age' })).toBeInTheDocument();
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

    const grouping = await screen.findByRole('combobox', {
      name: 'Grouping attribute',
    });
    await waitFor(() =>
      expect(
        within(grouping).getByRole('option', { name: 'circle' }),
      ).toBeInTheDocument(),
    );
    expect(
      within(grouping).queryByRole('option', { name: 'contactType' }),
    ).not.toBeInTheDocument();
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

  /** The attribute is created and bound without the researcher leaving. */
  it('creates a position attribute without leaving the stage', async () => {
    const harness = renderStageEditor(composerHolding({ layoutVariable: '' }));

    await harness.user.click(
      await screen.findByRole('button', {
        name: 'Create a new position attribute',
      }),
    );
    const name = await screen.findByRole('textbox', {
      name: 'Attribute name',
    });
    const creator = within(name.closest('[role="dialog"]') as HTMLElement);
    await harness.user.type(name, 'placedAt');
    await harness.user.click(
      creator.getByRole('button', { name: 'Create attribute' }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    // Bound here, not merely created: the researcher asked for it from this
    // control, so finding it in a list that has just grown is not the answer.
    const picker = await screen.findByRole('combobox', {
      name: 'Position attribute',
    });
    await waitFor(() =>
      expect(
        within(picker).getByRole('option', {
          name: 'placedAt',
        }),
      ).toHaveProperty('selected', true),
    );
  });

  /**
   * A composer's list is the only place a researcher meets connection types
   * while building one, so a protocol with none — or none of the kind this
   * study needs — would otherwise send them to the codebook and back with the
   * stage half-configured. Architect's own composer has always offered this.
   */
  it('creates a connection type without leaving the stage, and draws it', async () => {
    const harness = renderStageEditor(composerHolding({}));

    await harness.user.click(
      await screen.findByRole('button', {
        name: 'Create a new connection type',
      }),
    );
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Edge type name' }),
      'livesWith',
    );
    await harness.user.click(
      screen.getByRole('button', { name: 'Save entity' }),
    );
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

    await harness.user.click(
      await screen.findByRole('button', {
        name: 'Create a new connection type',
      }),
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

    const dialog = await addRow(harness, 'Create new node attribute field');
    const attribute = dialog.getByRole('combobox', { name: 'Attribute' });
    // The fixture's marking prompt already claims `highlighted`, so the picker
    // is not offering it — which is what makes the same picker offering it a
    // moment later the collaborator's change ARRIVING rather than a guess.
    expect(
      within(attribute).queryByRole('option', { name: 'highlighted' }),
    ).toBeNull();
    await harness.user.selectOptions(attribute, 'flagged');

    highlightInASociogram(harness, 'flagged');
    // Waited for rather than assumed: a save clicked before the change lands
    // is refused by nothing, which is the defect this test exists for. The
    // picker goes on offering `flagged` throughout — a picker that dropped the
    // value the row is holding would blank the control and write the blank
    // over the reference the researcher has to resolve — so the row's own gate
    // is the only thing left that can refuse it.
    await within(attribute).findByRole('option', { name: 'highlighted' });
    expect(
      within(attribute).getByRole('option', { name: 'flagged' }),
    ).toBeInTheDocument();
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

    const dialog = await addRow(harness, 'Create new node attribute field');
    await harness.user.selectOptions(
      dialog.getByRole('combobox', { name: 'Attribute' }),
      'age',
    );
    const control = dialog.getByRole('combobox', { name: 'Input control' });
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
