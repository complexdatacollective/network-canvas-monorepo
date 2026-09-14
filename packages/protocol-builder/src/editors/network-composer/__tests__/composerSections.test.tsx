import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  unvalidatedElsewhereMessage,
  validatedElsewhereMessage,
} from '../../../codebook/variableValidation.ts';
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
  addEdgeType,
  addPersonVariable,
  addRow,
  collectInAnAlterForm,
  composerHolding,
  composerInAnotherStage,
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

/**
 * One value of a list the codebook editor is authoring, label and stored value.
 *
 * The editor numbers its rows, so each is named by the position it was added
 * in — which is also what proves the second landed beside the first rather
 * than over it.
 */
const addOption = async (
  harness: ReturnType<typeof renderStageEditor>,
  position: number,
  label: string,
  value: string,
) => {
  await harness.user.click(
    screen.getByRole('button', { name: 'Create new option' }),
  );
  await harness.user.type(
    screen.getByRole('textbox', { name: `Option ${position} label` }),
    label,
  );
  await harness.user.type(
    screen.getByRole('textbox', { name: `Option ${position} value` }),
    value,
  );
};

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
   * A form is the questions asked about ONE kind of connection, so it does not
   * survive the entry being pointed at another kind: every field records an
   * attribute of the type the entry used to name, and the new type does not
   * have them.
   *
   * The row dialog renders the type and nothing else, so the form is a value
   * the submit never saw — kept by the rule that an editor may not delete what
   * it did not render, which is why this is the section's own business.
   */
  it('drops a connection’s questions when the entry is pointed at another type', async () => {
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
                  label: 'Anything else?',
                },
              ],
            },
          },
        ],
      }),
    );
    expect(await screen.findByText('Anything else?')).toBeInTheDocument();

    const dialog = await openRow(harness, 'Edit connection type');
    await harness.user.click(
      dialog.getByRole('radio', { name: 'family_edge' }),
    );
    await harness.user.click(dialog.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    // On screen first: the list under the entry is what the researcher reads,
    // and a question about the old type still standing there is the damage.
    await waitFor(() =>
      expect(screen.queryByText('Anything else?')).not.toBeInTheDocument(),
    );
    const saved = await harness.submit();
    expect(edgesOf(saved?.stageDocument ?? {})).toEqual([
      { id: KNOWS_ENTRY.id, subject: { entity: 'edge', type: 'family_edge' } },
    ]);
  });

  /**
   * The same act, for an entry that arrived naming no type at all.
   *
   * `edges` tolerates one — the preview names it, and `ConnectionForms` shows
   * nothing for it — so its questions are invisible until the researcher gives
   * it a type, and answering "unchanged" for it saved a form recording
   * attributes the chosen type does not have.
   */
  it('drops them for an entry that arrived naming no type', async () => {
    const harness = renderStageEditor(
      composerHolding({
        edges: [
          {
            id: 'composer-edge-1',
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

    const dialog = await openRow(harness, 'Edit connection type');
    await harness.user.click(
      dialog.getByRole('radio', { name: 'family_edge' }),
    );
    await harness.user.click(dialog.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    // The questions were invisible while the entry had no type, so the list
    // arriving with them under the new one is what the researcher sees.
    expect(screen.queryByText('Anything else?')).not.toBeInTheDocument();
    const saved = await harness.submit();
    expect(edgesOf(saved?.stageDocument ?? {})).toEqual([
      {
        id: 'composer-edge-1',
        subject: { entity: 'edge', type: 'family_edge' },
      },
    ]);
  });

  /**
   * What it drops is said. The dialog shows the connection type and nothing
   * else, so the questions go from a list the researcher cannot see while they
   * press Save — and this section reports it the way the rules editor reports
   * rules a change of kind takes away.
   */
  it('says how many questions a re-pointed connection lost', async () => {
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
                  label: 'Anything else?',
                },
              ],
            },
          },
        ],
      }),
    );
    expect(await screen.findByText('Anything else?')).toBeInTheDocument();

    const dialog = await openRow(harness, 'Edit connection type');
    await harness.user.click(
      dialog.getByRole('radio', { name: 'family_edge' }),
    );
    await harness.user.click(dialog.getByRole('button', { name: 'Save' }));

    const notice = await screen.findByText(
      'Pointing this connection at another kind removed the question it asked: it recorded an attribute the new kind does not have.',
    );
    // In a live region, so it is announced rather than only drawn.
    expect(notice.closest('[role="status"]')).not.toBeNull();
  });

  /**
   * And says it again for the next one.
   *
   * Two re-points that each take one question away say the same sentence, and
   * a live region whose text has not changed announces nothing — so the second
   * removal was silent to the reader this notice is for. Asserted as the
   * element rather than the words: what a live region reports is a change to
   * its content, which the same node standing there is not.
   */
  it('says it again when the next re-point takes as many', async () => {
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
                  label: 'Anything else?',
                },
              ],
            },
          },
          {
            id: 'composer-edge-2',
            subject: { entity: 'edge', type: 'family_edge' },
            form: {
              fields: [
                {
                  id: 'edge-field-2',
                  variable: 'isActive',
                  component: 'Boolean',
                  label: 'Still in touch?',
                },
              ],
            },
          },
        ],
      }),
    );
    // A third kind to move the first entry to, so the second entry's own type
    // is free for it afterwards.
    addEdgeType(harness, 'colleague_edge');

    const first = await openRow(harness, 'Edit connection type');
    await harness.user.click(
      await first.findByRole('radio', { name: 'colleague_edge' }),
    );
    await harness.user.click(first.getByRole('button', { name: 'Save' }));
    const dropped =
      'Pointing this connection at another kind removed the question it asked: it recorded an attribute the new kind does not have.';
    const announced = await screen.findByText(dropped);

    const second = await openRow(harness, 'Edit connection type', 1);
    await harness.user.click(second.getByRole('radio', { name: 'knows' }));
    await harness.user.click(second.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByText(dropped)).not.toBe(announced));
  });

  /**
   * The same rule one row down: a form field naming an attribute the codebook
   * has lost is a reference only the researcher can repair, and the row read
   * "Empty field" — which says the field asks for nothing at all.
   */
  it('names the attribute a form field has lost, rather than reading as empty', async () => {
    renderStageEditor(
      composerHolding({
        nodeForm: {
          fields: [
            { id: 'field-1', variable: 'former_attribute', component: 'Text' },
          ],
        },
      }),
    );

    expect(
      await screen.findByText(
        'former_attribute — this attribute is no longer in the codebook',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Empty field')).not.toBeInTheDocument();
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
   * Repointed, the control follows the new attribute rather than staying where
   * the last one left it.
   *
   * Two text attributes the codebook asks for with DIFFERENT controls, because
   * a fixture where every text attribute is a single-line box cannot tell a
   * control that followed the rebinding from one that was simply never moved
   * — and the row is reading its own held control first from the moment an
   * invention it completes has to keep one.
   */
  it('follows a rebinding to the control the codebook asks for', async () => {
    const harness = renderStageEditor(composerHolding({}));
    await switchOnNodeForm(harness);
    addPersonVariable(harness, 'notes', {
      name: 'notes',
      type: 'text',
      component: 'TextArea',
    });

    const dialog = await addRow(harness, 'Create new node attribute');
    await chooseAttributeById(
      harness.user,
      picker('Attribute'),
      'composerName',
    );
    const control = await dialog.findByRole('combobox', {
      name: 'Input control',
    });
    await waitFor(() => expect(control).toHaveValue('Text'));

    await chooseAttributeById(harness.user, picker('Attribute'), 'notes');

    await waitFor(() => expect(control).toHaveValue('TextArea'));
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
      await dialog.findByRole('switch', { name: 'Validation' }),
    );
    await harness.user.click(
      await dialog.findByRole('switch', { name: 'Required answer' }),
    );

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
   * The control the researcher chose survives the create it caused.
   *
   * A kind of answer that comes from a list is authored in the codebook
   * editor, which writes the attribute WITHOUT a control — in this family the
   * control belongs to the stage, so one attribute can be asked for on a
   * scale here and with radio buttons elsewhere. The row is then rebound from
   * the name it was inventing to the attribute that now exists, and a rule
   * that reads the codebook for the pairing finds nothing and answers with
   * the first control the kind allows: `RadioGroup` over the `LikertScale`
   * that DECIDED the kind. Asked with a control that is not first in its kind
   * for exactly that reason.
   */
  it('keeps the control that decided the kind when the create lands', async () => {
    const harness = renderStageEditor(
      composerHolding({ nodeForm: { fields: [] } }),
    );
    await switchOnNodeForm(harness);

    const dialog = await addRow(harness, 'Create new node attribute');
    await inventAttribute(harness.user, picker('Attribute'), 'closeness');
    const control = await dialog.findByRole('combobox', {
      name: 'Input control',
    });
    await harness.user.selectOptions(control, 'LikertScale');

    await harness.user.click(
      dialog.getByRole('button', {
        name: 'Create this attribute and its values',
      }),
    );
    expect(
      await screen.findByRole('textbox', { name: 'Attribute name' }),
    ).toHaveValue('closeness');
    await addOption(harness, 1, 'Not at all close', 'far');
    await addOption(harness, 2, 'Very close', 'near');
    await harness.user.click(
      screen.getByRole('button', { name: 'Create attribute' }),
    );

    // The create landed, which is the moment the row stops inventing and the
    // rule that pairs a control with an attribute is asked again.
    const created = await waitFor(() => {
      const variables = harness.hostCodebook().node?.person?.variables ?? {};
      const entry = Object.entries(variables).find(
        ([, variable]) => variable.name === 'closeness',
      );
      if (entry === undefined) {
        throw new Error('the codebook has no “closeness” attribute');
      }
      return entry;
    });
    // Written without one, which is what makes the row's own the only answer
    // there is.
    expect(created[1]).not.toHaveProperty('component');
    expect(control).toHaveValue('LikertScale');

    await harness.user.click(dialog.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const saved = await harness.submit();
    expect(nodeFormFieldsOf(saved?.stageDocument ?? {})).toEqual([
      {
        id: expect.any(String) as unknown as string,
        variable: created[0],
        component: 'LikertScale',
      },
    ]);
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
  /**
   * What the same box is called where nothing may be created — the other half
   * of the same fact, said to a researcher who cannot see the list. Asked for
   * by name in the negative case, so a site that started offering creation
   * fails here rather than quietly renaming its own search box.
   */
  const SEARCH_ONLY_LABEL = 'Find an attribute';
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
    searchLabel: string = SEARCH_LABEL,
  ): Promise<HTMLElement | null> => {
    await openRow(harness, 'Edit form field');
    return createRowIn(
      harness.user,
      picker('Attribute'),
      searchLabel,
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
        SEARCH_ONLY_LABEL,
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

/**
 * The save-time half of the two rules the stage's own pickers apply.
 *
 * A picker keeps the value it arrived holding whatever the filters say — one
 * that dropped its own pick would blank the control and write the blank over
 * the reference the researcher has to resolve — so a protocol carrying a
 * conflict opens here with nothing on screen filtered and nothing refusing it.
 * The stage then saved an export that mixes a checked answer with one this
 * stage wrote around the codebook. Neither case below is a pick the researcher
 * made here: the pickers keep those apart on their own.
 */
describe('a composer pick that conflicts with the rest of the protocol', () => {
  it('refuses the save for a grouping attribute a form elsewhere collects', async () => {
    const harness = renderStageEditor(
      composerHolding({ convexHullVariable: 'contactType' }),
    );
    // A second categorical attribute, so the collaborator's edit below has
    // something this picker can be WATCHED for: the attribute under test is
    // the one the picker is holding, which it goes on offering either way.
    addPersonVariable(harness, 'region', {
      name: 'region',
      type: 'categorical',
      options: [
        { label: 'North', value: 'north' },
        { label: 'South', value: 'south' },
      ],
    });
    const grouping = await waitFor(() =>
      picker('Create or select a categorical attribute for grouping'),
    );
    await waitFor(async () =>
      expect(await offeredAttributes(harness.user, grouping)).toContain(
        'region',
      ),
    );

    collectInAnAlterForm(harness, 'contactType', 'region');
    await waitFor(async () =>
      expect(await offeredAttributes(harness.user, grouping)).not.toContain(
        'region',
      ),
    );
    expect(await offeredAttributes(harness.user, grouping)).toContain(
      'contactType',
    );

    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByText(
        readMessage(validatedElsewhereMessage('contactType')),
      ),
    ).toBeInTheDocument();
  });

  /** The same rule the other way round, on the box that adds a node. */
  it('refuses the save for an attribute another stage stamps', async () => {
    const harness = renderStageEditor(composerHolding({}));
    const quickAdd = await waitFor(() =>
      picker('Create or select an attribute for the quick-add form'),
    );
    await waitFor(async () =>
      expect(await offeredAttributes(harness.user, quickAdd)).toContain(
        'relationship_to_ego',
      ),
    );

    // Two claims in one edit, for the same reason: `composerName` is what this
    // picker is holding, so its leaving is not something a test can watch for.
    highlightInASociogram(harness, 'composerName', 'relationship_to_ego');
    await waitFor(async () =>
      expect(await offeredAttributes(harness.user, quickAdd)).not.toContain(
        'relationship_to_ego',
      ),
    );
    expect(await offeredAttributes(harness.user, quickAdd)).toContain(
      'composerName',
    );

    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByText(
        readMessage(unvalidatedElsewhereMessage('composerName')),
      ),
    ).toBeInTheDocument();
  });
});

/**
 * Architect mounts the same nested validation section under the composer's own
 * quick-add picker as it does under the quick-add name generator's
 * (`sections/NodeConfiguration/NodeConfiguration.tsx:481-488`), and seeds the
 * attribute it creates there with the one rule the role itself needs.
 */
describe('the rules the composer’s quick-add attribute has to satisfy', () => {
  it('edits them under the picker, and writes them to the codebook', async () => {
    const harness = renderStageEditor(composerHolding({}));

    await harness.user.click(
      await screen.findByRole('switch', { name: 'Validation' }),
    );
    await harness.user.click(
      await screen.findByRole('switch', { name: 'Required answer' }),
    );

    await waitFor(() =>
      expect(
        harness.hostCodebook().node?.person?.variables?.composerName,
      ).toMatchObject({ validation: { required: true } }),
    );
  });

  it('creates an attribute that has to be answered', async () => {
    const harness = renderStageEditor(composerHolding({}));

    await inventAttribute(
      harness.user,
      picker('Create or select an attribute for the quick-add form'),
      'nickname',
    );

    const created = await waitFor(() => {
      const variables = harness.hostCodebook().node?.person?.variables ?? {};
      const entry = Object.values(variables).find(
        (variable) => variable.name === 'nickname',
      );
      if (entry === undefined) throw new Error('nothing was created yet');
      return entry;
    });
    // A participant adding a node through the quick-add box gives one thing,
    // so the attribute behind it is born requiring an answer.
    expect(created).toMatchObject({ validation: { required: true } });
  });
});

/**
 * A composer field keeps its own input control and that control's settings on
 * the STAGE (`ComposerFormFieldSchema`), and the contradiction analyser reads
 * both: a date field's allowed window is the picker's own bounds. Judged
 * against the codebook's pair instead, a rule this one dialog is able to
 * contradict in a single sitting was reported nowhere.
 */
describe('the rules a composer field authors', () => {
  const YEAR_PICKER = (min: string, max: string) => ({
    component: 'DatePicker',
    parameters: { type: 'year', min, max },
  });

  /**
   * The verdict the editor gives is the one protocol validation gives the
   * saved stage: a rule the attribute already holds is judged against the
   * window this FIELD renders it in, not the codebook's.
   */
  it('judges them against the window the FIELD renders', async () => {
    const harness = renderStageEditor(
      composerHolding({
        nodeForm: {
          fields: [
            {
              id: 'field-1',
              variable: 'metOn',
              ...YEAR_PICKER('2020', '2025'),
            },
          ],
        },
      }),
    );
    // Both attributes accept the same years in the CODEBOOK, so the rule one
    // of them arrives holding is satisfiable there — and unsatisfiable only
    // through the window this field puts on it.
    addPersonVariable(harness, 'bornOn', {
      name: 'bornOn',
      type: 'datetime',
      ...YEAR_PICKER('1990', '1995'),
    });
    addPersonVariable(harness, 'metOn', {
      name: 'metOn',
      type: 'datetime',
      validation: { sameAs: 'bornOn' },
      ...YEAR_PICKER('1990', '1995'),
    });

    // The attribute arrives holding the rule, so its nested Validation section
    // is open on it already.
    const dialog = await openRow(harness, 'Edit form field');

    expect(
      await dialog.findByText(
        'The comparisons for bornOn and metOn cannot be satisfied within their allowed ranges. Adjust the ranges, comparisons, or input controls.',
      ),
    ).toBeInTheDocument();
    // And a map that carries it does not reach the codebook: the section has
    // no submit to refuse with, so what it must not do is write it.
    await harness.user.click(
      dialog.getByRole('switch', { name: 'Required answer' }),
    );
    await waitFor(() =>
      expect(
        dialog.getByRole('switch', { name: 'Required answer' }),
      ).toBeChecked(),
    );
    expect(harness.hostCodebook().node?.person?.variables?.metOn).toEqual(
      expect.objectContaining({ validation: { sameAs: 'bornOn' } }),
    );
  });

  /**
   * The same, for an attribute the row has not created yet.
   *
   * An invented attribute has no codebook entry at all, so the field's own
   * control and settings are the ONLY rendering it has — and its rules are
   * authored in the row's draft surface rather than the codebook's. Judged
   * without them, the analyser read the invented answer as accepting any date
   * and offered it a comparison that cannot be satisfied.
   */
  it('judges an invented field’s rules against that field too', async () => {
    const harness = renderStageEditor(
      composerHolding({ nodeForm: { fields: [] } }),
    );
    // One comparison target the invented window can meet and one it cannot,
    // both bounded in the CODEBOOK: which of them is offered is the whole
    // question, and a list with neither would answer it by accident.
    addPersonVariable(harness, 'bornOn', {
      name: 'bornOn',
      type: 'datetime',
      component: 'DatePicker',
      parameters: { type: 'full', min: '1990-01-01', max: '1995-12-31' },
    });
    addPersonVariable(harness, 'movedOn', {
      name: 'movedOn',
      type: 'datetime',
      component: 'DatePicker',
      parameters: { type: 'full', min: '2020-01-01', max: '2025-12-31' },
    });
    await switchOnNodeForm(harness);

    const dialog = await addRow(harness, 'Create new node attribute');
    await inventAttribute(harness.user, picker('Attribute'), 'metOn');
    await harness.user.selectOptions(
      await dialog.findByRole('combobox', { name: 'Input control' }),
      'DatePicker',
    );
    fireEvent.change(dialog.getByLabelText('Earliest date'), {
      target: { value: '2020-01-01' },
    });
    fireEvent.change(dialog.getByLabelText('Latest date'), {
      target: { value: '2025-12-31' },
    });

    await harness.user.click(
      await dialog.findByRole('switch', { name: 'Validation' }),
    );
    await harness.user.click(
      await screen.findByRole('switch', {
        name: 'Same as another attribute',
      }),
    );

    const targets = screen.getByRole('combobox', {
      name: 'Same as another attribute',
    });
    await waitFor(() =>
      expect(
        within(targets).queryByRole('option', { name: 'bornOn' }),
      ).not.toBeInTheDocument(),
    );
    expect(
      within(targets).getByRole('option', { name: 'movedOn' }),
    ).toBeInTheDocument();
  });

  /**
   * The other half of the same rule: the attribute a comparison POINTS AT is
   * rendered by its own row of this form too.
   *
   * Read through the codebook instead, the editor offered a comparison the
   * saved stage makes impossible, because the window that makes it impossible
   * is one a sibling FIELD puts on the target.
   */
  it('judges them against the windows the other FIELDS render', async () => {
    const harness = renderStageEditor(
      composerHolding({
        nodeForm: {
          fields: [
            {
              id: 'field-1',
              variable: 'metOn',
              ...YEAR_PICKER('2020', '2025'),
            },
            {
              id: 'field-2',
              variable: 'bornOn',
              ...YEAR_PICKER('1990', '1995'),
            },
            {
              id: 'field-3',
              variable: 'movedOn',
              ...YEAR_PICKER('2020', '2025'),
            },
          ],
        },
      }),
    );
    // All three accept the same years in the CODEBOOK, so every comparison
    // between them is satisfiable there. Only the second field's own window
    // makes one of them impossible.
    for (const variableId of ['bornOn', 'metOn', 'movedOn']) {
      addPersonVariable(harness, variableId, {
        name: variableId,
        type: 'datetime',
        ...YEAR_PICKER('2020', '2025'),
      });
    }

    const dialog = await openRow(harness, 'Edit form field');
    await harness.user.click(
      await dialog.findByRole('switch', { name: 'Validation' }),
    );
    await harness.user.click(
      await screen.findByRole('switch', {
        name: 'Same as another attribute',
      }),
    );

    const targets = screen.getByRole('combobox', {
      name: 'Same as another attribute',
    });
    // The one the sibling row narrows is gone; the one nothing narrows is
    // still there, so what is being read is the form rather than an empty
    // answer.
    await waitFor(() =>
      expect(
        within(targets).queryByRole('option', { name: 'bornOn' }),
      ).not.toBeInTheDocument(),
    );
    expect(
      within(targets).getByRole('option', { name: 'movedOn' }),
    ).toBeInTheDocument();
  });

  /**
   * And not offered because the FORM would make it satisfiable, because the
   * form is not what the rule is saved on.
   *
   * A validation rule is written to the CODEBOOK attribute, and the protocol
   * judges that record through the codebook's own controls
   * (`rejectValidationContradictions`, over the entity's variables with no
   * stage overlay). So a comparison two fields' windows bring together is
   * still refused by the write when the attributes' own windows are disjoint:
   * offering it sent the researcher to a Save that could not succeed.
   */
  it('does not offer one the codebook record could not hold', async () => {
    const harness = renderStageEditor(
      composerHolding({
        nodeForm: {
          fields: [
            {
              id: 'field-1',
              variable: 'metOn',
              ...YEAR_PICKER('2020', '2025'),
            },
            {
              id: 'field-2',
              variable: 'bornOn',
              ...YEAR_PICKER('2020', '2025'),
            },
            {
              id: 'field-3',
              variable: 'movedOn',
              ...YEAR_PICKER('2020', '2025'),
            },
          ],
        },
      }),
    );
    // Disjoint in the CODEBOOK from the attribute being edited, and brought
    // together only by the window the second field renders it with.
    addPersonVariable(harness, 'bornOn', {
      name: 'bornOn',
      type: 'datetime',
      ...YEAR_PICKER('1990', '1995'),
    });
    addPersonVariable(harness, 'metOn', {
      name: 'metOn',
      type: 'datetime',
      ...YEAR_PICKER('2020', '2025'),
    });
    addPersonVariable(harness, 'movedOn', {
      name: 'movedOn',
      type: 'datetime',
      ...YEAR_PICKER('2020', '2025'),
    });

    const dialog = await openRow(harness, 'Edit form field');
    await harness.user.click(
      await dialog.findByRole('switch', { name: 'Validation' }),
    );
    await harness.user.click(
      await screen.findByRole('switch', {
        name: 'Same as another attribute',
      }),
    );

    const targets = await screen.findByRole('combobox', {
      name: 'Same as another attribute',
    });
    await waitFor(() =>
      expect(
        within(targets).queryByRole('option', { name: 'bornOn' }),
      ).not.toBeInTheDocument(),
    );
    // The one the codebook can hold is still there, so what is being read is
    // the record rather than an empty answer.
    expect(
      within(targets).getByRole('option', { name: 'movedOn' }),
    ).toBeInTheDocument();
  });

  /**
   * A comparison both readings accept is taken, and reaches the codebook.
   *
   * The codebook reading may only ever take a target away — read as the whole
   * answer it would refuse every comparison the fields' own windows make
   * possible, which is the half the round before this one was about.
   */
  it('writes one both readings accept', async () => {
    const harness = renderStageEditor(
      composerHolding({
        nodeForm: {
          fields: [
            {
              id: 'field-1',
              variable: 'metOn',
              ...YEAR_PICKER('2020', '2025'),
            },
            {
              id: 'field-2',
              variable: 'bornOn',
              ...YEAR_PICKER('2020', '2025'),
            },
          ],
        },
      }),
    );
    for (const variableId of ['bornOn', 'metOn']) {
      addPersonVariable(harness, variableId, {
        name: variableId,
        type: 'datetime',
        ...YEAR_PICKER('2020', '2025'),
      });
    }

    const dialog = await openRow(harness, 'Edit form field');
    await harness.user.click(
      await dialog.findByRole('switch', { name: 'Validation' }),
    );
    await harness.user.click(
      await screen.findByRole('switch', {
        name: 'Same as another attribute',
      }),
    );
    const targets = await screen.findByRole('combobox', {
      name: 'Same as another attribute',
    });
    await waitFor(() =>
      expect(
        within(targets).getByRole('option', { name: 'bornOn' }),
      ).toBeInTheDocument(),
    );
    await harness.user.selectOptions(targets, 'bornOn');

    // The codebook as the PROTOCOL holds it: the rule is on the attribute, so
    // nothing short of that is the rule having been saved.
    await waitFor(() =>
      expect(
        harness.hostCodebook().node?.person?.variables?.metOn,
      ).toHaveProperty('validation', { sameAs: 'bornOn' }),
    );
  });

  /**
   * Which of the two readings refused a rule is stated by the seam both this
   * surface and the row's own save ask
   * (`variableValidation.test.ts`'s `ruleMapIssueForWrite` group).
   *
   * It is not reachable from this dialog any more, and that is the point of
   * the two rounds above: a comparison is offered only where BOTH readings
   * accept it, and the section writes as the researcher types rather than at a
   * submit, so there is no moment at which a map only the codebook refuses is
   * sitting in front of them. A record narrowed under an authored rule is not
   * that moment either — the protocol then holds a type its own validation
   * rejects, and the attribute leaves the codebook with it.
   */

  /**
   * A boolean's domain is the control's too, which the analyser reads only
   * from a caller that has settled every judged attribute's rendering
   * (`stageEffectiveComponents`). Left unsettled, every boolean reads as
   * accepting both answers, and two the form pins to the same one still
   * accepted "different from".
   */
  it('judges a boolean’s answers against the controls the fields render', async () => {
    const harness = renderStageEditor(
      composerHolding({
        nodeForm: {
          fields: [
            { id: 'field-1', variable: 'isKin', component: 'Boolean' },
            { id: 'field-2', variable: 'isClose', component: 'Boolean' },
          ],
        },
      }),
    );
    // Each field offers the participant one button, so each answer can only be
    // `true` — and two answers that are both `true` cannot differ. The rule
    // arrives on the attribute, as it does from a codebook authored before the
    // form chose these controls.
    addPersonVariable(harness, 'isKin', {
      name: 'isKin',
      type: 'boolean',
      options: [{ label: 'Yes', value: true }],
      validation: { differentFrom: 'isClose' },
    });
    addPersonVariable(harness, 'isClose', {
      name: 'isClose',
      type: 'boolean',
      options: [{ label: 'Yes', value: true }],
    });

    // The attribute arrives holding the rule, so its nested Validation section
    // is open on it already.
    const dialog = await openRow(harness, 'Edit form field');

    expect(
      await dialog.findByText(
        'The rules require different answers for isClose and isKin, but their allowed ranges force the same value. Widen a range or change the comparison.',
      ),
    ).toBeInTheDocument();
    // And a map that carries it does not reach the codebook.
    await harness.user.click(
      dialog.getByRole('switch', { name: 'Required answer' }),
    );
    await waitFor(() =>
      expect(
        dialog.getByRole('switch', { name: 'Required answer' }),
      ).toBeChecked(),
    );
    expect(harness.hostCodebook().node?.person?.variables?.isKin).toEqual(
      expect.objectContaining({ validation: { differentFrom: 'isClose' } }),
    );
  });

  /**
   * And the attribute a row has just STOPPED rendering is not one of this
   * form's either.
   *
   * The list the row belongs to holds what was committed, so the row under
   * edit still names its old attribute while the picker shows the new one —
   * and read as part of this form, an attribute the row has moved off is
   * judged at a codebook control nothing renders it with, refusing a
   * comparison the protocol accepts. The row's committed name is the one
   * `siblingRenderings` already leaves out, for the same reason.
   */
  it('ignores the attribute the row under edit has moved off', async () => {
    const harness = renderStageEditor(
      composerHolding({
        nodeForm: {
          fields: [
            { id: 'field-1', variable: 'isKin', component: 'Boolean' },
            { id: 'field-2', variable: 'isPinned', component: 'Boolean' },
          ],
        },
      }),
    );
    for (const variableId of ['isKin', 'isPinned', 'isClose']) {
      addPersonVariable(harness, variableId, {
        name: variableId,
        type: 'boolean',
        component: 'Boolean',
        options: [{ label: 'Yes', value: true }],
      });
    }
    // `isKin` is asked for by another composer as well, with a control this
    // editor cannot see — so once this row moves off it, nothing here renders
    // it.
    composerInAnotherStage(harness, [
      { id: 'other-field-1', variable: 'isKin', component: 'Toggle' },
    ]);

    const dialog = await openRow(harness, 'Edit form field');
    await chooseAttributeById(harness.user, picker('Attribute'), 'isClose');
    await harness.user.click(
      await dialog.findByRole('switch', { name: 'Validation' }),
    );
    await harness.user.click(
      await screen.findByRole('switch', {
        name: 'Different from another attribute',
      }),
    );

    const targets = screen.getByRole('combobox', {
      name: 'Different from another attribute',
    });
    await waitFor(() =>
      expect(
        within(targets).getByRole('option', { name: 'isKin' }),
      ).toBeInTheDocument(),
    );
    // The one this form still renders is refused, so what changed is which
    // attributes count as this form's rather than the reading itself.
    expect(
      within(targets).queryByRole('option', { name: 'isPinned' }),
    ).not.toBeInTheDocument();
  });

  /**
   * And not against a control this form does not choose.
   *
   * A composer field's control lives on the stage, so an attribute another
   * composer overrides is not asked for with the codebook's control anywhere —
   * reading it there pins a boolean this form never renders, and refuses a
   * comparison the protocol accepts. Protocol validation drops such attributes
   * from the judged set (`schema.ts`'s `unknownRenderingFor`); so does this.
   */
  it('ignores a rendering only another stage decides', async () => {
    const harness = renderStageEditor(
      composerHolding({
        nodeForm: {
          fields: [
            { id: 'field-1', variable: 'isKin', component: 'Boolean' },
            { id: 'field-2', variable: 'isPinned', component: 'Boolean' },
          ],
        },
      }),
    );
    // All three are declared in the codebook as a choice of one value, so all
    // three are pinned to `true` wherever that declaration is what renders
    // them.
    for (const variableId of ['isKin', 'isPinned', 'isClose']) {
      addPersonVariable(harness, variableId, {
        name: variableId,
        type: 'boolean',
        component: 'Boolean',
        options: [{ label: 'Yes', value: true }],
      });
    }
    // `isClose` is asked for by another composer, with a control that offers
    // both answers — which this editor cannot see, and must not guess at.
    composerInAnotherStage(harness, [
      { id: 'other-field-1', variable: 'isClose', component: 'Toggle' },
    ]);

    const dialog = await openRow(harness, 'Edit form field');
    await harness.user.click(
      await dialog.findByRole('switch', { name: 'Validation' }),
    );
    await harness.user.click(
      await screen.findByRole('switch', {
        name: 'Different from another attribute',
      }),
    );

    const targets = screen.getByRole('combobox', {
      name: 'Different from another attribute',
    });
    await waitFor(() =>
      expect(
        within(targets).getByRole('option', { name: 'isClose' }),
      ).toBeInTheDocument(),
    );
    // The one THIS form pins is still refused, so what changed is the reach of
    // the reading rather than the reading itself.
    expect(
      within(targets).queryByRole('option', { name: 'isPinned' }),
    ).not.toBeInTheDocument();
  });
});

/**
 * The titled groups inside the two sections, as released Architect had them
 * (`sections/NodeConfiguration/NodeConfiguration.tsx:453-561`,
 * `sections/EdgeConfiguration/EdgeConfiguration.tsx:241-261`).
 *
 * Each group's sentence is what the researcher is given to decide on. Folded
 * into a hint under one control, as the rebuild had them, a sentence describes
 * the box rather than the decision — and the decision about automatic layout
 * had no sentence at all here, because it was a section of its own.
 */
describe('the groups a network composer divides its decisions into', () => {
  it('divides the node configuration into Architect’s four groups, in order', async () => {
    renderStageEditor(composerHolding({}));

    const nodes = within(
      await screen.findByRole('region', { name: 'Node configuration' }),
    );
    // The whole list, in order, so a group added or reordered fails here.
    expect(
      nodes
        .getAllByRole('region')
        .map(
          (region) => within(region).getAllByRole('heading')[0]?.textContent,
        ),
    ).toEqual([
      'Quick add attribute',
      // Architect's own nesting: the attribute's rules are edited under the
      // picker that binds it (`NodeConfiguration.tsx:481-488`).
      'Validation',
      'Node positions',
      'Automatic layout',
      'Group hulls',
      'Editable attributes',
    ]);
  });

  it('gives each group Architect’s own sentence', async () => {
    renderStageEditor(composerHolding({}));

    expect(
      await screen.findByRole('region', { name: 'Quick add attribute' }),
    ).toHaveAccessibleDescription(
      'The attribute populated by the inline quick-add field when a node is added from the toolbar — typically a name or label.',
    );
    expect(
      screen.getByRole('region', { name: 'Node positions' }),
    ).toHaveAccessibleDescription(
      "Stores each node's position on the canvas. Reusing the same attribute across stages preserves positions as the participant moves between tasks.",
    );
    expect(
      screen.getByRole('region', { name: 'Automatic layout' }),
    ).toHaveAccessibleDescription(
      'When on, nodes are arranged by a force-directed layout. Participants can toggle this during the interview; this sets the starting state.',
    );
    expect(
      screen.getByRole('region', { name: 'Group hulls' }),
    ).toHaveAccessibleDescription(
      'Draw shaded outlines around groups of nodes that share a value of a categorical attribute. Choose (or create) the attribute whose values participants can group nodes into — by tapping nodes with the Groups tool, or by lasso-selecting several at once.',
    );
  });

  /**
   * Each control inside the group whose sentence explains it — the point of
   * the groups, and what a flat section could not say.
   */
  it('puts each control inside the group that describes it', async () => {
    renderStageEditor(composerHolding({}));

    const quickAdd = within(
      await screen.findByRole('region', { name: 'Quick add attribute' }),
    );
    expect(
      quickAdd.getByRole('group', {
        name: 'Create or select an attribute for the quick-add form',
      }),
    ).toBeInTheDocument();
    // And no hint of its own: the group's sentence is where the words are now,
    // so all the control still says about itself is that it must be answered.
    expect(
      quickAdd.getByRole('group', {
        name: 'Create or select an attribute for the quick-add form',
      }),
    ).toHaveAccessibleDescription(/^Required\s*$/);

    expect(
      within(screen.getByRole('region', { name: 'Node positions' })).getByRole(
        'group',
        {
          name: 'Create or select an attribute to store node coordinates',
        },
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Group hulls' })).getByRole(
        'group',
        { name: 'Create or select a categorical attribute for grouping' },
      ),
    ).toBeInTheDocument();
  });

  /**
   * A group is a group and not a section: nothing here reaches the host's list
   * of the stage's sections, which is what a researcher navigates by.
   */
  it('registers none of them as a section of the stage', async () => {
    const harness = renderStageEditor(composerHolding({}));

    await waitFor(() => expect(harness.outline()).toHaveLength(3));
    expect(harness.outline().map((section) => section.title)).toEqual([
      'Node configuration',
      'Editable attributes',
      'Edge configuration',
    ]);
  });

  /** The edge half: one group around the list of types the participant draws. */
  it('wraps the edge types in Architect’s connection-types group', async () => {
    renderStageEditor(composerHolding({}));

    const edges = within(
      await screen.findByRole('region', { name: 'Edge configuration' }),
    );
    const connectionTypes = edges.getByRole('region', {
      name: 'Connection types',
    });
    expect(connectionTypes).toHaveAccessibleDescription(
      'Select the edge types participants can create on the canvas. Each selected type gets its own set of editable attributes below.',
    );
    // Architect's own label for the list, with no hint under it: the sentence
    // above is the group's.
    const list = within(connectionTypes).getByRole('list', {
      name: 'Edge types',
    });
    expect(list).toHaveAccessibleDescription('');
  });
});
