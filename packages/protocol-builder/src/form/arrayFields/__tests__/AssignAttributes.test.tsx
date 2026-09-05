import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ComponentType, useMemo } from 'react';
import { describe, expect, it } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { useStageEditorController } from '../../../controller.ts';
import BuilderSection from '../../../sections/BuilderSection.tsx';
import {
  createStageIdentity,
  ProtocolBuilderSessionStore,
} from '../../../session.ts';
import ProtocolArrayField from '../../ProtocolArrayField.tsx';
import StageEditorShell from '../../StageEditorShell.tsx';
import AssignAttributes, {
  committedAttributeVariableIds,
  makeAssignAttributesValidation,
  type AttributeValue,
} from '../AssignAttributes.tsx';

const NO_DRAFT_VARIABLES: ReadonlySet<string> = new Set();

/**
 * A stand-in for the host's variable picker. Everything this list needs from a
 * picker is a control that reports a variable id; how a host lists, groups and
 * creates them is the host's business, which is why the real one is injected.
 */
const VariablePicker = NativeSelectField as ComponentType<
  Record<string, unknown>
>;

/**
 * Two stages: the one being edited, and a form elsewhere that already collects
 * `worried` with validation. Assigning `worried` from an unvalidated writer
 * would bypass that validation, which is the contradiction the gate names.
 */
const protocolSections: Record<string, SectionDoc> = {
  [sectionId({ kind: 'stageOrder' })]: { stages: ['stage-1', 'stage-2'] },
  [sectionId({ kind: 'stage', stageId: 'stage-1' })]: {
    id: 'stage-1',
    type: 'NameGenerator',
    label: 'People',
    subject: { entity: 'node', type: 'person' },
    prompts: [{ id: 'p1', text: 'Who?' }],
  },
  [sectionId({ kind: 'stage', stageId: 'stage-2' })]: {
    id: 'stage-2',
    type: 'AlterForm',
    label: 'About them',
    subject: { entity: 'node', type: 'person' },
    introductionPanel: { title: 'About', text: 'About' },
    form: { fields: [{ variable: 'worried', prompt: 'Are they worried?' }] },
  },
  [sectionId({ kind: 'codebookNode', typeId: 'person' })]: {
    name: 'Person',
    color: 'node-color-seq-1',
    shape: { default: 'circle' },
    variables: {
      worried: {
        name: 'Worried',
        type: 'boolean',
        validation: { required: true },
      },
      helpful: { name: 'Helpful', type: 'boolean' },
    },
  },
};

const VARIABLE_OPTIONS = [
  { label: 'Worried', value: 'worried', type: 'boolean' },
  { label: 'Helpful', value: 'helpful', type: 'boolean' },
];

function createSession(fields: SectionDoc) {
  return new ProtocolBuilderSessionStore({
    identity: createStageIdentity('NameGenerator', () => 'stage-1'),
    fields,
    protocolSections,
    manifestRevision: { sequence: 1n, hash: 'revision-1' },
    access: { mode: 'editable', leaseOwner: 'tab-1', leaseEpoch: 1n },
    buildCandidate: ({ stageDocument }) => ({
      name: 'Assign attributes test',
      schemaVersion: 8,
      codebook: {},
      stages: [stageDocument],
    }),
  });
}

function renderAttributeList(
  session: ProtocolBuilderSessionStore,
  committed: readonly AttributeValue[],
) {
  function Host() {
    const controller = useStageEditorController(session, 'stage-form');
    const committedVariableIds = useMemo(
      () => committedAttributeVariableIds(committed),
      [],
    );
    const validation = useMemo(
      () =>
        makeAssignAttributesValidation({
          allVariables:
            controller.snapshot.protocolContext.codebook.node?.person
              ?.variables ?? {},
          committedVariableIds,
          draftValidatedVariables: NO_DRAFT_VARIABLES,
          hasValidatedUseElsewhere: () => false,
        }),
      [committedVariableIds, controller.snapshot.protocolContext],
    );

    return (
      <StageEditorShell
        controller={controller}
        actions={({ formId }) => (
          <SubmitButton form={formId}>Finished editing</SubmitButton>
        )}
      >
        <BuilderSection title="Additional attributes">
          <ProtocolArrayField
            name="additionalAttributes"
            label="Additional attributes"
            component={AssignAttributes}
            subject={{ entity: 'node', type: 'person' }}
            variableOptions={VARIABLE_OPTIONS}
            variablePickerComponent={VariablePicker}
            draftValidatedVariables={NO_DRAFT_VARIABLES}
            committedVariableIds={committedVariableIds}
            {...validation}
          />
        </BuilderSection>
      </StageEditorShell>
    );
  }

  return render(
    <DialogProvider>
      <Host />
    </DialogProvider>,
  );
}

describe('AssignAttributes', () => {
  it('reads the codebook role a variable already plays from the package context', async () => {
    const user = userEvent.setup();
    const session = createSession({
      label: 'People',
      subject: { entity: 'node', type: 'person' },
      prompts: [{ id: 'p1', text: 'Who?' }],
      additionalAttributes: [],
    });
    renderAttributeList(session, []);

    await user.click(
      await screen.findByRole('button', {
        name: 'Add new attribute to assign',
      }),
    );

    // `worried` is collected by the OTHER stage's form, which the package's own
    // protocol context is the only source for here. Choosing it must be
    // refused, in the words that say why.
    const picker = await screen.findByRole('combobox', {
      name: 'Create or select an attribute',
    });
    await user.selectOptions(picker, 'worried');

    // Named by its CODEBOOK name, which only the package's protocol context
    // can supply — the pool the picker was handed carries labels, not the
    // codebook entry the message is about.
    await screen.findByText(
      /"Worried" is collected by a form elsewhere in this protocol/,
    );
  });

  it('lets a stamp keep a variable that nothing else validates', async () => {
    const user = userEvent.setup();
    const session = createSession({
      label: 'People',
      subject: { entity: 'node', type: 'person' },
      prompts: [{ id: 'p1', text: 'Who?' }],
      additionalAttributes: [],
    });
    renderAttributeList(session, []);

    await user.click(
      await screen.findByRole('button', {
        name: 'Add new attribute to assign',
      }),
    );
    await user.selectOptions(
      await screen.findByRole('combobox', {
        name: 'Create or select an attribute',
      }),
      'helpful',
    );

    // The second cell only appears once an attribute is chosen, which is also
    // the proof that the pick was accepted.
    await screen.findByText('Value to assign');
    expect(screen.queryByText(/is collected by a form elsewhere/)).toBeNull();
    await waitFor(() =>
      expect(
        session.getSnapshot().editedSection.fields.additionalAttributes,
      ).toEqual([{ variable: 'helpful' }]),
    );
  });
});
