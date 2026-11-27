import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  fixtureStageIds,
  fixtureStageId,
  fixtureTypeId,
  fixtureVariableId,
} from '../../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import { testId } from '../../../testing/testId.ts';
import {
  expectStageUntouched,
  fieldTabTexts,
  knowsDefinition,
  mountedAs,
  authorsDateSettingsFromField,
  authorsValuesFromField,
  stageNameInput,
} from '../../__tests__/formEditorHarness.tsx';
import { alterEdgeFormStageEditor } from '../AlterEdgeFormStageEditor.ts';

const KNOWS = fixtureTypeId('edge', 'knows');
const CLOSENESS = fixtureVariableId(
  { entity: 'edge', typeName: 'knows' },
  'closeness',
);

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
const ALTER_EDGE_FORM_INDEX = fixtureStageIds().indexOf(
  fixtureStageId('alter-edge-form-1'),
);

const createFixture = () => ({
  create: { type: 'AlterEdgeForm' as const, position: ALTER_EDGE_FORM_INDEX },
  editor: mountedAs(alterEdgeFormStageEditor.AlterEdgeForm),
});

/** The form's editor, where each field shows its attribute in its corner. */
const formEditor = async () =>
  within(await screen.findByRole('textbox', { name: 'Form content' }));

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
        harness.outline().find((section) => section.title === 'Form')?.state,
      ).toBe('Not available yet'),
    );
  });

  it('follows an attribute deleted elsewhere without echoing it back', async () => {
    const harness = renderStageEditor(openFixture());
    await formEditor();
    expect(await fieldTabTexts(harness)).toContainEqual(
      expect.stringContaining('edgeNotes'),
    );

    harness.receiveCodebookUpdate({
      edge: {
        [KNOWS]: knowsDefinition({
          [CLOSENESS]: {
            name: 'closeness',
            type: 'ordinal',
            options: [
              {
                id: testId('option/closeness/3'),
                label: { 'en-US': 'Very close' },
                value: 3,
              },
              {
                id: testId('option/closeness/2'),
                label: { 'en-US': 'Somewhat close' },
                value: 2,
              },
              {
                id: testId('option/closeness/1'),
                label: { 'en-US': 'Not close' },
                value: 1,
              },
            ],
          },
        }),
      },
    });

    // Shown in the field's tab, with its settings button.
    await waitFor(async () =>
      expect(await fieldTabTexts(harness)).toContainEqual(
        expect.stringContaining('Deleted attribute'),
      ),
    );
    // Their deletion is theirs. The field the researcher authored is still on
    // the stage, still pointing where they pointed it: an editor that quietly
    // dropped it would be saving somebody else's edit as this one.
    expectStageUntouched(harness);
    // Nor does a save keep a field that collects nothing: it is refused until
    // the researcher chooses another attribute for the field.
    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByText('Choose an attribute for this field.'),
    ).toBeInTheDocument();
    expectStageUntouched(harness);
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
      typeId: KNOWS,
    });
  });

  it('sets, in the edge codebook, what a date field accepts', async () => {
    const harness = renderStageEditor(openFixture());

    await authorsDateSettingsFromField(harness, {
      kind: 'codebookEdge',
      typeId: KNOWS,
    });
  });
});
