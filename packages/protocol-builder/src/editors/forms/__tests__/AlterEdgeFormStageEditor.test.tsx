import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { fixtureStageIds } from '../../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import { writeInto } from '../../__tests__/writeInto.ts';
import { AlterEdgeFormStageEditor } from '../AlterEdgeFormStageEditor.tsx';
import {
  fieldsOf,
  knowsDefinition,
  mountedAs,
  openField,
  removeRow,
  stageNameInput,
} from './formEditorHarness.tsx';

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
  stageId: 'alter-edge-form-1',
  editor: mountedAs(AlterEdgeFormStageEditor),
});

/** Where a host would insert a new one: over the form the fixture holds. */
const ALTER_EDGE_FORM_INDEX = fixtureStageIds().indexOf('alter-edge-form-1');

const createFixture = () => ({
  create: { type: 'AlterEdgeForm' as const, position: ALTER_EDGE_FORM_INDEX },
  editor: mountedAs(AlterEdgeFormStageEditor),
});

describe('the editor for a form about each relationship', () => {
  it('composes the stage in the order the plan sets out', async () => {
    const harness = renderStageEditor(openFixture());

    await waitFor(() => expect(harness.outline()).toHaveLength(7));
    expect(harness.outline().map((section) => section.title)).toEqual([
      'Stage name',
      'Edge type',
      'Stage filter',
      'Task introduction',
      'Form fields',
      'Skip logic',
      'Interviewer guidance',
    ]);
  });

  it('opens on the stage the protocol holds, asking about edges', async () => {
    renderStageEditor(openFixture());

    expect(screen.getByRole('textbox', { name: 'Stage name' })).toHaveValue(
      'Alter Edge Form',
    );
    expect(screen.getByRole('radio', { name: 'knows' })).toBeChecked();
    // The section says what it is for, and it is edges rather than nodes: an
    // edge stage told the researcher it filtered nodes would be describing a
    // different network.
    expect(
      screen.getByText(
        'Create rules that limit which edges are available on this stage.',
      ),
    ).toBeInTheDocument();
    expect(
      await screen.findByText('Add any notes about this relationship', {
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

  it('opens a new stage on the interface template', async () => {
    const harness = renderStageEditor(createFixture());

    // A per-alter-edge form has no authored defaults, so a new one has no type
    // chosen, and its form waits on one. Only the name arrives filled in,
    // proposed because the session is creating the stage.
    await waitFor(() => expect(stageNameInput()).not.toHaveValue(''));
    expect(stageNameInput().value).toMatch(/^Per Alter Edge Form/);
    expect(screen.getByRole('radio', { name: 'knows' })).not.toBeChecked();
    await waitFor(() =>
      expect(
        harness.outline().find((section) => section.title === 'Form fields')
          ?.state,
      ).toBe('Not available yet'),
    );
  });

  it('saves a new stage once the researcher has written it', async () => {
    const harness = renderStageEditor(createFixture());
    await waitFor(() => expect(stageNameInput()).not.toHaveValue(''));

    await writeInto(harness, stageNameInput(), 'About each relationship');
    await harness.user.click(screen.getByRole('radio', { name: 'knows' }));
    await writeInto(
      harness,
      screen.getByRole('textbox', { name: 'Introduction heading' }),
      'About each relationship',
    );
    await writeInto(
      harness,
      screen.getByRole('textbox', { name: 'Introduction text' }),
      'A few questions about each relationship.',
    );

    const dialog = await openField(harness, 'Create new form field');
    await harness.user.selectOptions(
      dialog.getByRole('combobox', { name: 'Attribute' }),
      'edgeNotes',
    );
    await writeInto(
      harness,
      dialog.getByRole('textbox', { name: 'Question text' }),
      'What do you want to record about this?',
    );
    await harness.user.click(dialog.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    expect(request?.stageDocument.label).toBe('About each relationship');
    expect(request?.stageDocument.subject).toEqual({
      entity: 'edge',
      type: 'knows',
    });
    expect(request?.stageDocument.introductionPanel).toEqual({
      title: 'About each relationship',
      text: 'A few questions about each relationship.',
    });
    expect(fieldsOf(request?.stageDocument ?? {})).toEqual([
      {
        id: expect.any(String) as unknown as string,
        variable: 'edgeNotes',
        prompt: 'What do you want to record about this?',
      },
    ]);
  });

  it('refuses a form that collects nothing, and says which section is at fault', async () => {
    const harness = renderStageEditor(openFixture());

    await removeRow(harness, 'field');
    await waitFor(() =>
      expect(
        screen.queryByText('Add any notes about this relationship', {
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

  it('follows an attribute deleted elsewhere without echoing it back', async () => {
    const harness = renderStageEditor(openFixture());
    expect(
      await screen.findByText('Collects "edgeNotes" as text.'),
    ).toBeInTheDocument();

    const dispatch = vi.spyOn(harness.session, 'dispatch');
    harness.receiveCodebookUpdate({
      edge: {
        knows: knowsDefinition({
          closeness: {
            name: 'closeness',
            type: 'ordinal',
            options: [
              { label: 'Very close', value: 3 },
              { label: 'Somewhat close', value: 2 },
              { label: 'Not close', value: 1 },
            ],
          },
        }),
      },
    });

    expect(
      await screen.findByText('This attribute is no longer in the codebook.'),
    ).toBeInTheDocument();
    expect(dispatch).not.toHaveBeenCalled();
    expect(harness.pendingCommands()).toHaveLength(0);
    // The session says so too, naming the attribute: a stage collecting one
    // that is gone cannot be saved.
    await waitFor(() =>
      expect(
        harness.outline().find((section) => section.title === 'Form fields')
          ?.state,
      ).toBe(
        'Has a problem. The attribute "edgeNotes" does not exist in the codebook',
      ),
    );
  });

  it('refuses to save a stage the session has made read-only', async () => {
    const harness = renderStageEditor(openFixture());

    harness.setReadOnly();

    await waitFor(() =>
      expect(
        screen.getByRole('textbox', { name: 'Introduction heading' }),
      ).toBeDisabled(),
    );

    // The shell's refusal is the guarantee, not the chrome above it: a
    // keyboard, a stale render, or another host's own button can all still
    // submit the form. See `fallbackSaveControl.test.tsx` for why the save
    // control this editor falls back to stays pressable.
    const form = harness.baseElement.querySelector('form');
    if (form === null) throw new Error('the editor rendered no form');
    fireEvent.submit(form);

    expect(
      await screen.findByText('This stage is read-only', { exact: false }),
    ).toBeInTheDocument();
  });
});
