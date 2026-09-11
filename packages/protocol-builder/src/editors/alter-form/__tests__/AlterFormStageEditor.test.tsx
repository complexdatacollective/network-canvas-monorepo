import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  fixtureStageIds,
  loadFixtureStage,
} from '../../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import { exactlyText } from '../../../testing/text.ts';
import {
  expectStageUntouched,
  fieldsOf,
  mountedAs,
  authorsDateSettingsFromField,
  authorsValuesFromField,
  collectAttribute,
  openField,
  personDefinition,
  removeRow,
  stageNameInput,
} from '../../__tests__/formEditorHarness.tsx';
import { writeInto } from '../../__tests__/writeInto.ts';
import { alterFormStageEditor } from '../AlterFormStageEditor.ts';

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
  editor: mountedAs(alterFormStageEditor.AlterForm),
});

/** Where a host would insert a new one: over the form the fixture holds. */
const ALTER_FORM_INDEX = fixtureStageIds().indexOf('alter-form-1');

const createFixture = () => ({
  create: { type: 'AlterForm' as const, position: ALTER_FORM_INDEX },
  editor: mountedAs(alterFormStageEditor.AlterForm),
});

/**
 * What the collapsed field row's badge says about a `text`/`Text` attribute —
 * true of `relationship_to_ego` both before and after it is renamed, since
 * the badge names the attribute's kind and control, not its identifier.
 */
const FIELD_ROW_BADGE = 'Text attribute using Text input input control';

/**
 * What is true of THIS interface and no other. The list of sections it
 * composes, and the round trip over its fixture stage, are asked of all four
 * form editors together in `editors/__tests__/formEditors.test.tsx`.
 */
describe('the editor for a form about each person', () => {
  it('opens on the stage the protocol holds', async () => {
    renderStageEditor(openFixture());

    expect(screen.getByRole('textbox', { name: 'Stage name' })).toHaveValue(
      'Alter Form',
    );
    expect(screen.getByRole('radio', { name: 'person' })).toBeChecked();
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue(
      'Introduction to the alter form',
    );
    expect(
      await screen.findByText("What is this person's relationship to you?", {
        exact: false,
      }),
    ).toBeInTheDocument();
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
      editor: mountedAs(alterFormStageEditor.AlterForm),
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

  it('opens a new stage on the interface template', async () => {
    const harness = renderStageEditor(createFixture());

    // A per-alter form has no authored defaults, so a new one has no type
    // chosen — and its form cannot be written until one is, because there is
    // no codebook for its fields to collect into. Only the name arrives
    // filled in, proposed because the stage is being created.
    await waitFor(() => expect(stageNameInput()).not.toHaveValue(''));
    expect(stageNameInput().value).toMatch(/^Per Alter Form/);
    expect(screen.getByRole('radio', { name: 'person' })).not.toBeChecked();
    await waitFor(() =>
      expect(
        harness
          .outline()
          .find((section) => section.title === 'Form configuration')?.state,
      ).toBe('Not available yet'),
    );
  });

  it('saves a new stage once the researcher has written it', async () => {
    const harness = renderStageEditor(createFixture());
    await waitFor(() => expect(stageNameInput()).not.toHaveValue(''));

    await writeInto(harness, stageNameInput(), 'About each person');
    await harness.user.click(screen.getByRole('radio', { name: 'person' }));
    await writeInto(
      harness,
      screen.getByRole('textbox', { name: 'Title' }),
      'About each person',
    );
    await writeInto(
      harness,
      screen.getByRole('textbox', { name: 'Introduction text' }),
      'A few more questions about each person.',
    );

    const dialog = await openField(harness, 'Create new form field');
    await collectAttribute(harness, dialog, 'relationship_to_ego');
    await writeInto(
      harness,
      dialog.getByRole('textbox', { name: 'Question text' }),
      'How do you know this person?',
    );
    await harness.user.click(dialog.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    expect(request?.stageDocument.label).toBe('About each person');
    expect(request?.stageDocument.subject).toEqual({
      entity: 'node',
      type: 'person',
    });
    expect(request?.stageDocument.introductionPanel).toEqual({
      title: 'About each person',
      text: 'A few more questions about each person.',
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
        harness
          .outline()
          .find((section) => section.title === 'Form configuration')?.state,
      ).toBe('Has a problem'),
    );
  });

  it('writes nothing when the researcher discards the edit', async () => {
    const harness = renderStageEditor(openFixture());

    await harness.user.clear(screen.getByRole('textbox', { name: 'Title' }));
    await harness.user.type(
      screen.getByRole('textbox', { name: 'Title' }),
      'A heading nobody kept',
    );
    expectStageUntouched(harness);

    await harness.cancel();

    expectStageUntouched(harness);
  });

  /**
   * A collaborator renaming an attribute this form collects is their edit, not
   * this researcher's: the row's badge names the attribute's kind and control
   * rather than its identifier, so it reads the same before and after the
   * rename — it is `expectStageUntouched` below that proves the rename did
   * not get echoed back into a save.
   */
  it('follows an attribute renamed elsewhere without echoing it back', async () => {
    const harness = renderStageEditor(openFixture());
    expect(
      await screen.findByText(exactlyText(FIELD_ROW_BADGE)),
    ).toBeInTheDocument();

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
      await screen.findByText(exactlyText(FIELD_ROW_BADGE)),
    ).toBeInTheDocument();
    // Their rename is theirs. The stage still holds the field the researcher
    // authored, pointing at the attribute it always did — so a save carries
    // their change nowhere.
    expectStageUntouched(harness);
    await harness.roundTrip({ unowned: [] });
  });

  it('refuses to save a stage somebody else is editing', async () => {
    const harness = renderStageEditor({ ...openFixture(), readOnly: true });

    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Title' })).toBeDisabled(),
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

  /**
   * The section's own tests prove these controls; these prove the wiring —
   * that this editor's form fields reach the codebook for the subject IT is
   * about, and write what the researcher authored into the person codebook
   * rather than into the editor's own stage document.
   */
  it('changes, in the person codebook, the values a field offers', async () => {
    const harness = renderStageEditor(openFixture());

    await authorsValuesFromField(harness, {
      kind: 'codebookNode',
      typeId: 'person',
    });
  });

  it('sets, in the person codebook, what a date field accepts', async () => {
    const harness = renderStageEditor(openFixture());

    await authorsDateSettingsFromField(harness, {
      kind: 'codebookNode',
      typeId: 'person',
    });
  });
});
