import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { loadFixtureStage } from '../../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import { AlterFormStageEditor } from '../AlterFormStageEditor.tsx';
import {
  fieldsOf,
  mountedAs,
  openField,
  personDefinition,
  removeRow,
} from './formEditorHarness.tsx';
import { newStageFields } from './newStageFields.ts';

/** See `formEditorHarness.tsx` for why the rich-text editor is stood in for. */
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

const openFixture = () => ({
  stageId: 'alter-form-1',
  editor: mountedAs(AlterFormStageEditor),
});

describe('the editor for a form about each person', () => {
  it('composes the stage in the order the plan sets out', async () => {
    const harness = renderStageEditor(openFixture());

    await waitFor(() => expect(harness.outline()).toHaveLength(7));
    expect(harness.outline().map((section) => section.title)).toEqual([
      'Stage name',
      'Node type',
      'Stage filter',
      'Task introduction',
      'Form fields',
      'Skip logic',
      'Interviewer guidance',
    ]);
  });

  it('opens on the stage the protocol holds', async () => {
    renderStageEditor(openFixture());

    expect(screen.getByRole('textbox', { name: 'Stage name' })).toHaveValue(
      'Alter Form',
    );
    expect(screen.getByRole('radio', { name: 'person' })).toBeChecked();
    expect(
      screen.getByRole('textbox', { name: 'Introduction heading' }),
    ).toHaveValue('Introduction to the alter form');
    expect(
      await screen.findByText("What is this person's relationship to you?", {
        exact: false,
      }),
    ).toBeInTheDocument();
  });

  it('saves the stage it opened, losing nothing', async () => {
    const harness = renderStageEditor(openFixture());

    expect(harness.ownedKeys()).toEqual([
      'form',
      'introductionPanel',
      'label',
      'subject',
    ]);
    await harness.roundTrip({ unowned: [] });
  });

  /**
   * The stage's own filter is the one key the fixture stage does not carry,
   * and it is a capability: a stage that arrives with one opens with it
   * switched on, and a save must give it back exactly as it was.
   */
  it('keeps a filter the stage already has', async () => {
    const harness = renderStageEditor({
      stage: {
        id: 'alter-form-filtered',
        type: 'AlterForm',
        fields: {
          ...loadFixtureStage('alter-form-1').fields,
          filter: {
            rules: [
              {
                id: 'rule-a',
                type: 'node',
                options: { type: 'person', operator: 'EXISTS' },
              },
            ],
          },
        },
      },
      editor: mountedAs(AlterFormStageEditor),
    });

    await waitFor(() =>
      expect(
        harness.outline().find((section) => section.title === 'Stage filter')
          ?.state,
      ).not.toBe('Switched off'),
    );
    expect(harness.ownedKeys()).toContain('filter');
    await harness.roundTrip({ unowned: [] });
  });

  it('starts a new stage from the interface template', async () => {
    const harness = renderStageEditor({
      stage: {
        id: 'alter-form-new',
        type: 'AlterForm',
        fields: newStageFields('AlterForm'),
      },
      editor: mountedAs(AlterFormStageEditor),
    });

    // A per-alter form has no authored defaults, so a new one has no type
    // chosen — and its form cannot be written until one is, because there is
    // no codebook for its fields to collect into.
    expect(screen.getByRole('radio', { name: 'person' })).not.toBeChecked();
    await waitFor(() =>
      expect(
        harness.outline().find((section) => section.title === 'Form fields')
          ?.state,
      ).toBe('Not available yet'),
    );

    await harness.user.type(
      screen.getByRole('textbox', { name: 'Stage name' }),
      'About each person',
    );
    await harness.user.click(screen.getByRole('radio', { name: 'person' }));
    await harness.user.type(
      screen.getByRole('textbox', { name: 'Introduction heading' }),
      'About each person',
    );
    await harness.user.type(
      screen.getByRole('textbox', { name: 'Introduction text' }),
      'A few more questions about each person.',
    );

    const dialog = await openField(harness, 'Create new form field');
    await harness.user.selectOptions(
      dialog.getByRole('combobox', { name: 'Attribute' }),
      'relationship_to_ego',
    );
    await harness.user.type(
      dialog.getByRole('textbox', { name: 'Question text' }),
      'How do you know this person?',
    );
    await harness.user.click(dialog.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    expect(request?.stageDocument.subject).toEqual({
      entity: 'node',
      type: 'person',
    });
    expect(fieldsOf(request?.stageDocument ?? {})).toEqual([
      {
        id: expect.any(String) as unknown as string,
        variable: 'relationship_to_ego',
        prompt: 'How do you know this person?',
      },
    ]);
  });

  it('refuses a form that collects nothing, and says which section is at fault', async () => {
    const harness = renderStageEditor(openFixture());

    await removeRow(harness, 'field');
    await removeRow(harness, 'field');
    await waitFor(() =>
      expect(
        screen.queryByText("What is this person's relationship to you?", {
          exact: false,
        }),
      ).not.toBeInTheDocument(),
    );

    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByText(/Add at least one field/),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        harness.outline().find((section) => section.title === 'Form fields')
          ?.state,
      ).toBe('Has a problem'),
    );
  });

  it('writes nothing when the researcher discards the edit', async () => {
    const harness = renderStageEditor(openFixture());

    await harness.user.clear(
      screen.getByRole('textbox', { name: 'Introduction heading' }),
    );
    await harness.user.type(
      screen.getByRole('textbox', { name: 'Introduction heading' }),
      'A heading nobody kept',
    );
    expect(harness.pendingCommands()).toHaveLength(0);

    await harness.cancel();

    expect(harness.pendingCommands()).toHaveLength(0);
    expect(harness.session.getSnapshot().editedSection.fields).toEqual(
      harness.seeded.fields,
    );
  });

  /**
   * A collaborator renaming an attribute this form collects is their edit, not
   * this session's: the field now asks for something called something else,
   * which the researcher has to be able to see, and echoing the rename back
   * would save it as ours.
   */
  it('follows an attribute renamed elsewhere without echoing it back', async () => {
    const harness = renderStageEditor(openFixture());
    expect(
      await screen.findByText('Collects "relationship_to_ego" as text.'),
    ).toBeInTheDocument();

    const dispatch = vi.spyOn(harness.session, 'dispatch');
    harness.receiveCodebookUpdate({
      node: {
        person: personDefinition({
          relationship_to_ego: {
            name: 'how_they_know_each_other',
            type: 'text',
            component: 'Text',
          },
          flagged: { name: 'flagged', type: 'boolean', component: 'Boolean' },
        }),
      },
    });

    expect(
      await screen.findByText('Collects "how_they_know_each_other" as text.'),
    ).toBeInTheDocument();
    expect(dispatch).not.toHaveBeenCalled();
    expect(harness.pendingCommands()).toHaveLength(0);
  });

  it('refuses to save a stage the session has made read-only', async () => {
    const harness = renderStageEditor(openFixture());

    harness.setReadOnly();

    const save = await screen.findByRole('button', { name: 'Save stage' });
    await waitFor(() => expect(save).toBeDisabled());
    expect(
      screen.getByRole('textbox', { name: 'Introduction heading' }),
    ).toBeDisabled();

    // A disabled button is chrome, not the guarantee. Submitting the form
    // itself is what a keyboard, a stale render, or another host's own button
    // can still do.
    const form = harness.baseElement.querySelector('form');
    if (form === null) throw new Error('the editor rendered no form');
    fireEvent.submit(form);

    expect(
      await screen.findByText('This stage is read-only', { exact: false }),
    ).toBeInTheDocument();
  });
});
