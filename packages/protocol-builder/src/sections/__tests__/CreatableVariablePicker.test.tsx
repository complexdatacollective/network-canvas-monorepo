import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

/**
 * The window between the click and the codebook's answer, which no test going
 * through the harness's host can hold open: the compound edit is applied
 * before the click's own act() has settled, so the busy state is over by the
 * time anything could look at it.
 *
 * The control is mounted directly here for that reason, with the answer held
 * in the test's own hand. Nothing is stubbed that the control depends on —
 * `onCreateOption` IS the seam, and a caller answering it slowly is exactly
 * what a real codebook round trip is.
 */
describe('the create control while the codebook write is in flight', () => {
  const mountControl = () => {
    let answer: ((created: boolean) => void) | undefined;
    const onCreateOption = () =>
      new Promise<boolean>((resolve) => {
        answer = resolve;
      });
    render(
      <CreatableVariablePickerControl
        name="variable"
        options={[]}
        emptyMessage="Nothing to choose from yet."
        onCreateOption={onCreateOption}
      />,
    );
    return {
      user: userEvent.setup(),
      /** Answers the create that is waiting, as the codebook would. */
      answerWith: (created: boolean) => {
        if (answer === undefined) throw new Error('Nothing is waiting.');
        answer(created);
      },
    };
  };

  const nameBox = () =>
    screen.getByRole('textbox', { name: 'Create a new attribute' });
  const createButton = () =>
    screen.getByRole('button', { name: 'Create the attribute' });

  /**
   * Pressing it twice would ask the codebook for the same attribute twice, and
   * the second write is the one that gets refused for a duplicate name — a
   * refusal about something the researcher did not do.
   */
  it('holds the create button until the codebook has answered', async () => {
    const { user, answerWith } = mountControl();

    await user.type(nameBox(), 'nominated_early');
    expect(createButton()).toBeEnabled();
    await user.click(createButton());

    expect(createButton()).toBeDisabled();
    // Still the name they typed: nothing has been written yet.
    expect(nameBox()).toHaveValue('nominated_early');

    // Emptied only now — which is also why the button stays disabled after a
    // create that landed: there is no longer a name to create.
    answerWith(true);
    await waitFor(() => expect(nameBox()).toHaveValue(''));
  });

  /** The refusal is about that name, so the box is what they correct. */
  it('gives the button back with the refused name still in the box', async () => {
    const { user, answerWith } = mountControl();

    await user.type(nameBox(), 'nominated early');
    await user.click(createButton());
    answerWith(false);

    // Enabled again, because pressing it once more is the whole point of a
    // refusal the researcher can correct.
    await waitFor(() => expect(createButton()).toBeEnabled());
    expect(nameBox()).toHaveValue('nominated early');
  });
});
