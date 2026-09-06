import { screen, waitFor, within } from '@testing-library/react';
import { type ComponentType, useCallback, useMemo, useState } from 'react';
import { describe, expect, it } from 'vitest';

import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import Section from '@codaco/fresco-ui/Section';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { useCreateCodebookVariable } from '../../codebook/useCodebookVariableEdits.ts';
import AssignAttributes from '../../form/arrayFields/AssignAttributes.tsx';
import ProtocolArrayField from '../../form/ProtocolArrayField.tsx';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import {
  type CodebookSubject,
  variablesForSubject,
} from '../../protocol-context.ts';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import { CreatableVariablePickerControl } from '../CreatableVariablePicker.tsx';

const SUBJECT: CodebookSubject = { entity: 'node', type: 'person' };

const NO_VARIABLES: ReadonlySet<string> = new Set();

// Rows know nothing about what any control takes, so the picker reaches them
// as an open-record renderer — adapted once, exactly as a section does it.
const VariablePicker = CreatableVariablePickerControl as ComponentType<
  Record<string, unknown>
>;

/**
 * The host half of the seam, as a section that offers stamps supplies it.
 *
 * The picker is injected as `variablePickerComponent` and reaches the rows'
 * `onCreateOption` through `AssignAttributes`' `onCreateVariable`; the codebook
 * write is the package's own compound edit, applied by the harness's in-memory
 * host exactly as a real one would. Nothing here is a stand-in — what this
 * supplies is what a host supplies: which type a created attribute is, and
 * where a refusal is shown.
 */
function StampedAttributes() {
  const { protocolContext } = useStageEditorForm();
  const createVariable = useCreateCodebookVariable(SUBJECT);
  const [problem, setProblem] = useState<string | undefined>(undefined);

  const variableOptions = useMemo(
    () =>
      Object.entries(variablesForSubject(protocolContext, SUBJECT)).map(
        ([id, variable]) => ({
          value: id,
          label: variable.name,
          type: variable.type,
        }),
      ),
    [protocolContext],
  );

  // Answered as a variable id or as nothing at all: the row commits its own
  // cell only when the codebook write landed, so a refusal leaves it naming
  // nothing rather than an attribute that does not exist.
  const onCreateVariable = useCallback(
    async (variableName: string) => {
      const outcome = await createVariable({
        name: variableName,
        type: 'boolean',
        component: 'Toggle',
      });
      if (outcome.status === 'refused') {
        setProblem(outcome.message);
        return undefined;
      }
      setProblem(undefined);
      return outcome.variableId;
    },
    [createVariable],
  );

  return (
    <Section title="Additional attributes">
      <ProtocolArrayField
        name="additionalAttributes"
        label="Additional attributes"
        component={AssignAttributes}
        subject={SUBJECT}
        variableOptions={variableOptions}
        variablePickerComponent={VariablePicker}
        onCreateVariable={onCreateVariable}
        draftValidatedVariables={NO_VARIABLES}
        committedVariableIds={NO_VARIABLES}
      />
      {problem !== undefined && (
        <Alert variant="destructive">
          <AlertDescription>{problem}</AlertDescription>
        </Alert>
      )}
    </Section>
  );
}

/** The same list, with nothing offering to create anything. */
function SelectableAttributes() {
  const { protocolContext } = useStageEditorForm();
  const variableOptions = useMemo(
    () =>
      Object.entries(variablesForSubject(protocolContext, SUBJECT)).map(
        ([id, variable]) => ({
          value: id,
          label: variable.name,
          type: variable.type,
        }),
      ),
    [protocolContext],
  );

  return (
    <Section title="Additional attributes">
      <ProtocolArrayField
        name="additionalAttributes"
        label="Additional attributes"
        component={AssignAttributes}
        subject={SUBJECT}
        variableOptions={variableOptions}
        variablePickerComponent={VariablePicker}
        draftValidatedVariables={NO_VARIABLES}
        committedVariableIds={NO_VARIABLES}
      />
    </Section>
  );
}

const renderRows = (sections: React.ReactNode) =>
  renderStageEditor({ stageId: 'name-generator-1', sections });

const addRow = async (harness: ReturnType<typeof renderRows>) => {
  await harness.user.click(
    await screen.findByRole('button', { name: 'Add new attribute to assign' }),
  );
};

const picker = () =>
  screen.getByRole('combobox', {
    name: 'Create or select an attribute',
  }) as HTMLSelectElement;

describe('the creatable attribute picker', () => {
  /**
   * The attribute a researcher wants is often the one they have only just
   * thought of, and a picker that could only choose would send them to the
   * codebook and back to finish a single thought.
   *
   * The codebook write is a real compound edit through the harness's in-memory
   * host, so this also proves the attribute actually lands in the protocol the
   * editor is holding — not just that a callback was called.
   */
  it('creates the attribute a row asks for, and selects it', async () => {
    const harness = renderRows(<StampedAttributes />);
    await addRow(harness);

    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Create a new attribute' }),
      'nominated_early',
    );
    await harness.user.click(
      screen.getByRole('button', { name: 'Create the attribute' }),
    );

    await waitFor(() =>
      expect(
        within(picker()).getByRole('option', { name: 'nominated_early' }),
      ).toBeInTheDocument(),
    );
    const created = picker().value;
    expect(created).not.toBe('');

    const person =
      harness.session.getSnapshot().protocolSections[
        sectionId({ kind: 'codebookNode', typeId: 'person' })
      ];
    if (person === undefined) throw new Error('the person type is gone');
    expect(
      (person.variables as Record<string, { type?: string }>)[created],
    ).toMatchObject({ name: 'nominated_early', type: 'boolean' });

    // The name box is emptied, so the button cannot create the same attribute
    // a second time by being pressed again.
    expect(
      screen.getByRole('textbox', { name: 'Create a new attribute' }),
    ).toHaveValue('');
  });

  /**
   * A row is handed a variable id or nothing, so it cannot carry a refusal —
   * and a create that quietly did nothing leaves the researcher pressing the
   * button again. The codebook refuses a name it cannot store (a space, here)
   * in its own words, and those are the words that appear.
   */
  it('says why an attribute it could not create was not created', async () => {
    const harness = renderRows(<StampedAttributes />);
    await addRow(harness);

    const box = await screen.findByRole('textbox', {
      name: 'Create a new attribute',
    });
    await harness.user.type(box, 'nominated early');
    await harness.user.click(
      screen.getByRole('button', { name: 'Create the attribute' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /draft is invalid/,
    );
    // The refusal is about the name they typed, so the name is still there to
    // be corrected.
    expect(box).toHaveValue('nominated early');
    // Nothing was written, so the row still names nothing.
    expect(picker().value).toBe('');
    const person =
      harness.session.getSnapshot().protocolSections[
        sectionId({ kind: 'codebookNode', typeId: 'person' })
      ];
    if (person === undefined) throw new Error('the person type is gone');
    expect(
      Object.values(person.variables as Record<string, { name?: string }>).map(
        (variable) => variable.name,
      ),
    ).not.toContain('nominated early');
  });

  /**
   * Choosing from what exists is the right answer wherever inventing an
   * attribute would be a decision the researcher has not been asked to make,
   * so the control offers nothing to create when nothing can be created — and
   * the list itself is still there.
   */
  it('is the plain picker where nothing may be created', async () => {
    const harness = renderRows(<SelectableAttributes />);
    await addRow(harness);

    expect(picker()).toBeInTheDocument();
    expect(
      screen.queryByRole('textbox', { name: 'Create a new attribute' }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Create the attribute' }),
    ).toBeNull();
  });
});
