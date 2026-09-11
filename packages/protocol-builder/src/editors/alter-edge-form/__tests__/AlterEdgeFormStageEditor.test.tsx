import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { fixtureStageIds } from '../../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import {
  expectStageUntouched,
  fieldsOf,
  knowsDefinition,
  mountedAs,
  authorsDateSettingsFromField,
  authorsValuesFromField,
  openField,
  removeRow,
  stageNameInput,
} from '../../__tests__/formEditorHarness.tsx';
import { writeInto } from '../../__tests__/writeInto.ts';
import { alterEdgeFormStageEditor } from '../AlterEdgeFormStageEditor.ts';

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
  editor: mountedAs(alterEdgeFormStageEditor.AlterEdgeForm),
});

/** Where a host would insert a new one: over the form the fixture holds. */
const ALTER_EDGE_FORM_INDEX = fixtureStageIds().indexOf('alter-edge-form-1');

const createFixture = () => ({
  create: { type: 'AlterEdgeForm' as const, position: ALTER_EDGE_FORM_INDEX },
  editor: mountedAs(alterEdgeFormStageEditor.AlterEdgeForm),
});

/** What the collapsed field row's badge says about the `edgeNotes` field. */
const FIELD_ROW_BADGE = 'Text attribute using Text area input control';

/**
 * Matches an element by its exact full text where that text is split across
 * child elements (the badge above bolds the type and control names), so a
 * plain string match cannot find it. Excludes any ancestor whose child
 * already carries the whole text, so only the innermost element matches.
 */
const exactlyText =
  (text: string) =>
  (_: string, element: Element | null): boolean =>
    element !== null &&
    element.textContent === text &&
    ![...element.children].some((child) => child.textContent === text);

/**
 * What is true of THIS interface and no other. The list of sections it
 * composes, and the round trip over its fixture stage, are asked of all four
 * form editors together in `editors/__tests__/formEditors.test.tsx`.
 */
describe('the editor for a form about each relationship', () => {
  it('opens on the stage the protocol holds, asking about edges', async () => {
    renderStageEditor(openFixture());

    expect(screen.getByRole('textbox', { name: 'Stage name' })).toHaveValue(
      'Alter Edge Form',
    );
    expect(screen.getByRole('radio', { name: 'knows' })).toBeChecked();
    // The stage-filter section's description is one generic sentence shared
    // by node and edge stages alike.
    expect(
      screen.getByText(
        'Create rules that filter which nodes or edges are displayed on this stage.',
      ),
    ).toBeInTheDocument();
    expect(
      await screen.findByText('Add any notes about this relationship', {
        exact: false,
      }),
    ).toBeInTheDocument();
    await import('node:fs').then(({ writeFileSync }) =>
      writeFileSync('/tmp/edge-dom.html', document.body.innerHTML),
    );
  });

  it('opens a new stage on the interface template', async () => {
    const harness = renderStageEditor(createFixture());

    // A per-alter-edge form has no authored defaults, so a new one has no type
    // chosen, and its form waits on one. Only the name arrives filled in,
    // proposed because the stage is being created.
    await waitFor(() => expect(stageNameInput()).not.toHaveValue(''));
    expect(stageNameInput().value).toMatch(/^Per Alter Edge Form/);
    expect(screen.getByRole('radio', { name: 'knows' })).not.toBeChecked();
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

    await writeInto(harness, stageNameInput(), 'About each relationship');
    await harness.user.click(screen.getByRole('radio', { name: 'knows' }));
    await writeInto(
      harness,
      screen.getByRole('textbox', { name: 'Title' }),
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

  it('follows an attribute deleted elsewhere without echoing it back', async () => {
    const harness = renderStageEditor(openFixture());
    expect(
      await screen.findByText(exactlyText(FIELD_ROW_BADGE)),
    ).toBeInTheDocument();

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
    // Their deletion is theirs. The field the researcher authored is still on
    // the stage, still pointing where they pointed it: an editor that quietly
    // dropped it would be saving somebody else's edit as this one.
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
   * about, and write what the researcher authored into the edge codebook
   * rather than into the editor's own stage document.
   */
  it('changes, in the edge codebook, the values a field offers', async () => {
    const harness = renderStageEditor(openFixture());

    await authorsValuesFromField(harness, {
      kind: 'codebookEdge',
      typeId: 'knows',
    });
  });

  it('sets, in the edge codebook, what a date field accepts', async () => {
    const harness = renderStageEditor(openFixture());

    await authorsDateSettingsFromField(harness, {
      kind: 'codebookEdge',
      typeId: 'knows',
    });
  });
});
