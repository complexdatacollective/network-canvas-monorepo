import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import {
  addPersonVariable,
  addRow,
  composerHolding,
  edgeFormFieldsOf,
  edgesOf,
  nodeFormFieldsOf,
  openRow,
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
    const entries = edgesOf(saved?.stageDocument ?? {});
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      subject: { entity: 'edge', type: 'knows' },
    });
    expect(typeof entries[0]?.id).toBe('string');
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
      await screen.findByRole('dialog', {
        name: 'Delete this connection type?',
      }),
    ).toBeInTheDocument();
    await harness.user.click(
      await screen.findByRole('button', { name: 'Cancel' }),
    );

    // The confirmation is what has to be named here: the row's own control and
    // the dialog's confirm button both read "Delete connection type", so the
    // dialog going is the only thing a button query could not tell apart from
    // the row surviving — which is the other half of the answer.
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Delete this connection type?' }),
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
    expect(nodeFormFieldsOf(saved?.stageDocument ?? {})[0]).toMatchObject({
      variable: 'composerName',
      component: 'TextArea',
      label: 'Who?',
    });
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
