import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { fixtureStageIds } from '../../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import { writeInto } from '../../__tests__/writeInto.ts';
import { EgoFormStageEditor } from '../EgoFormStageEditor.tsx';
import {
  fieldsOf,
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
  stageId: 'ego-form-1',
  editor: mountedAs(EgoFormStageEditor),
});

/** Where a host would insert a new ego form: over the one the fixture holds. */
const EGO_FORM_INDEX = fixtureStageIds().indexOf('ego-form-1');

const createFixture = () => ({
  create: { type: 'EgoForm' as const, position: EGO_FORM_INDEX },
  editor: mountedAs(EgoFormStageEditor),
});

describe('the editor for a form about the participant', () => {
  it('composes the stage in the order the plan sets out', async () => {
    const harness = renderStageEditor(openFixture());

    await waitFor(() => expect(harness.outline()).toHaveLength(5));
    expect(harness.outline().map((section) => section.title)).toEqual([
      'Stage name',
      'Task introduction',
      'Form fields',
      'Skip logic',
      'Interviewer guidance',
    ]);
  });

  it('opens on the stage the protocol holds', async () => {
    renderStageEditor(openFixture());

    expect(screen.getByRole('textbox', { name: 'Stage name' })).toHaveValue(
      'Ego Form',
    );
    expect(
      screen.getByRole('textbox', { name: 'Introduction heading' }),
    ).toHaveValue('Introduction');
    expect(
      await screen.findByText('What is your name?', { exact: false }),
    ).toBeInTheDocument();
    // An ego form has no subject to choose: the schema fixes it as the
    // interview's ego, so there is no type picker on this stage at all.
    expect(
      screen.queryByRole('radio', { name: 'person' }),
    ).not.toBeInTheDocument();
  });

  it('saves the stage it opened, losing nothing', async () => {
    const harness = renderStageEditor(openFixture());

    expect(harness.ownedKeys()).toEqual(['form', 'introductionPanel', 'label']);
    await harness.roundTrip({ unowned: [] });
  });

  it('opens a new stage on the interface template', async () => {
    renderStageEditor(createFixture());

    // An ego form has no authored defaults, so a new one arrives empty and
    // every required part of it is the researcher's to write — except the
    // name, which the session proposes because it is creating the stage.
    await waitFor(() => expect(stageNameInput()).not.toHaveValue(''));
    expect(stageNameInput().value).toMatch(/^Ego Form/);
    expect(
      screen.getByRole('textbox', { name: 'Introduction heading' }),
    ).toHaveValue('');
  });

  it('saves a new stage once the researcher has written it', async () => {
    const harness = renderStageEditor(createFixture());
    await waitFor(() => expect(stageNameInput()).not.toHaveValue(''));

    await writeInto(harness, stageNameInput(), 'About you');
    await writeInto(
      harness,
      screen.getByRole('textbox', { name: 'Introduction heading' }),
      'About you',
    );
    await writeInto(
      harness,
      screen.getByRole('textbox', { name: 'Introduction text' }),
      'A few questions about you before we begin.',
    );

    const dialog = await openField(harness, 'Create new form field');
    await harness.user.selectOptions(
      dialog.getByRole('combobox', { name: 'Attribute' }),
      'ego_name',
    );
    await writeInto(
      harness,
      dialog.getByRole('textbox', { name: 'Question text' }),
      'What is your name?',
    );
    await harness.user.click(dialog.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    expect(request?.stageDocument.label).toBe('About you');
    expect(request?.stageDocument.introductionPanel).toEqual({
      title: 'About you',
      text: 'A few questions about you before we begin.',
    });
    // The id is the row's own identity, minted on add so a reorder or a
    // removal is committed as the operation it was.
    expect(fieldsOf(request?.stageDocument ?? {})).toEqual([
      {
        id: expect.any(String) as unknown as string,
        variable: 'ego_name',
        prompt: 'What is your name?',
      },
    ]);
  });

  it('refuses a form that collects nothing, and says which section is at fault', async () => {
    const harness = renderStageEditor(openFixture());

    await removeRow(harness, 'field');
    await waitFor(() =>
      expect(
        screen.queryByText('What is your name?', { exact: false }),
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
   * A collaborator deleting an attribute this form collects is their edit, not
   * this session's. The editor has to show what happened — otherwise the form
   * goes on claiming to collect something the codebook no longer has — and
   * must not emit a command of its own, which would save their deletion as
   * ours.
   */
  it('follows an attribute deleted elsewhere without echoing it back', async () => {
    const harness = renderStageEditor(openFixture());
    expect(
      await screen.findByText('Collects "ego_name" as text.'),
    ).toBeInTheDocument();

    const dispatch = vi.spyOn(harness.session, 'dispatch');
    harness.receiveCodebookUpdate({ ego: { variables: {} } });

    expect(
      await screen.findByText('This attribute is no longer in the codebook.'),
    ).toBeInTheDocument();
    expect(dispatch).not.toHaveBeenCalled();
    expect(harness.pendingCommands()).toHaveLength(0);
    // The session says so too, naming the attribute, so the researcher is not
    // left to notice the badge: a stage collecting an attribute that is gone
    // cannot be saved.
    await waitFor(() =>
      expect(
        harness.outline().find((section) => section.title === 'Form fields')
          ?.state,
      ).toBe(
        'Has a problem. The attribute "ego_name" does not exist in the codebook',
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
