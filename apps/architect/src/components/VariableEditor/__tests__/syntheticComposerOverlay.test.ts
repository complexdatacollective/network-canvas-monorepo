import { describe, expect, it } from 'vitest';

import {
  type CurrentProtocol,
  CurrentProtocolSchema,
  type Variable,
  type VariableSynthetic,
} from '@codaco/protocol-validation';

import {
  collectComposerRenderings,
  type SyntheticDraftContext,
  validateAssembledVariable,
} from '../syntheticDraft';

/**
 * Verification 27: a synthetic draft the variable editor reports as safe must
 * not leave the protocol record schema-invalid. The editor validates the lone
 * variable via VariableSchema; the record superRefines the Composer overlay
 * (validateComposerFieldSyntheticWindows / validateComposerFieldBooleanProbabilities).
 *
 * Location: apps/architect/src/components/VariableEditor/tmp-verify-27.test.ts
 * Run: pnpm --filter @codaco/architect exec vitest run src/components/VariableEditor/tmp-verify-27.test.ts
 */

type Loose = Record<string, unknown>;

// Mirrors SyntheticDataEditorInner's context construction, including its
// derivation of the variable's NetworkComposer renderings from the protocol's
// stages — derived here from the SAME protocol object the record parse below
// sees, so the two surfaces read one construction.
const contextFor = (
  variable: Variable,
  variableId: string,
  protocol: Loose,
): SyntheticDraftContext => ({
  variable,
  options:
    'options' in variable && Array.isArray(variable.options)
      ? (variable.options as { label: string; value: string | number }[])
      : [],
  required: Boolean('validation' in variable && variable.validation?.required),
  composerRenderings: collectComposerRenderings(
    protocol.stages as CurrentProtocol['stages'],
    variableId,
    'node',
    'person',
  ),
});

const protocolWith = (
  extraVariables: Record<string, Loose>,
  composerFields: Loose[],
): Loose => ({
  name: 'tmp-verify-27',
  schemaVersion: 8,
  codebook: {
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        shape: { default: 'circle' },
        variables: {
          name: { name: 'Name', type: 'text', component: 'Text' },
          layoutPosition: { name: 'Layout_Position', type: 'layout' },
          ...extraVariables,
        },
      },
    },
  },
  stages: [
    {
      id: 'nc-1',
      label: 'Build the network',
      type: 'NetworkComposer',
      subject: { entity: 'node', type: 'person' },
      quickAdd: 'name',
      layoutVariable: 'layoutPosition',
      background: { concentricCircles: 4 },
      nodeForm: { fields: composerFields },
    },
  ],
});

const issueText = (
  result: ReturnType<typeof CurrentProtocolSchema.safeParse>,
) => (result.success ? '' : JSON.stringify(result.error.issues));

describe('editor-approved synthetic drafts vs record-level Composer overlay', () => {
  it('datetime window pinned out of reach by a Composer DatePicker field', () => {
    const dob = { name: 'DOB', type: 'datetime' } as const satisfies Variable;
    const synthetic: VariableSynthetic = {
      distribution: 'uniform',
      min: '1950-01-01',
      max: '1960-12-31',
    } as VariableSynthetic;

    const field = {
      variable: 'dob',
      component: 'DatePicker',
      parameters: { min: '2000-01-01', max: '2010-12-31' },
    };

    // Control: without the synthetic descriptor the protocol is valid, so any
    // failure below is attributable to the saved draft alone.
    const control = CurrentProtocolSchema.safeParse(
      protocolWith({ dob: { ...dob } }, [field]),
    );
    expect(control.success, `control invalid: ${issueText(control)}`).toBe(
      true,
    );

    // The editor's save-time check (validateAssembledVariable is exactly what
    // handleSubmit runs before dispatching updateVariableByUUID).
    const editorErrors = validateAssembledVariable(
      contextFor(dob, 'dob', protocolWith({ dob: { ...dob } }, [field])),
      synthetic,
    );

    // The record the save produces.
    const saved = CurrentProtocolSchema.safeParse(
      protocolWith({ dob: { ...dob, synthetic } }, [field]),
    );

    // CORRECT behaviour: the two surfaces agree — either the editor rejects
    // the draft, or the saved protocol stays schema-valid.
    expect(
      editorErrors !== undefined || saved.success,
      `editor accepted (errors=${JSON.stringify(editorErrors)}) but record rejects: ${issueText(saved)}`,
    ).toBe(true);
  });

  it('boolean probabilityTrue a Composer Boolean field cannot draw', () => {
    const agreed = {
      name: 'Agreed',
      type: 'boolean',
      options: [{ label: 'No', value: false }],
    } as const satisfies Variable;
    const synthetic: VariableSynthetic = {
      probabilityTrue: 1,
    } as VariableSynthetic;

    const field = { variable: 'agreed', component: 'Boolean' };

    const control = CurrentProtocolSchema.safeParse(
      protocolWith({ agreed: { ...agreed } }, [field]),
    );
    expect(control.success, `control invalid: ${issueText(control)}`).toBe(
      true,
    );

    const editorErrors = validateAssembledVariable(
      contextFor(
        agreed,
        'agreed',
        protocolWith({ agreed: { ...agreed } }, [field]),
      ),
      synthetic,
    );

    const saved = CurrentProtocolSchema.safeParse(
      protocolWith({ agreed: { ...agreed, synthetic } }, [field]),
    );

    expect(
      editorErrors !== undefined || saved.success,
      `editor accepted (errors=${JSON.stringify(editorErrors)}) but record rejects: ${issueText(saved)}`,
    ).toBe(true);
  });
});
