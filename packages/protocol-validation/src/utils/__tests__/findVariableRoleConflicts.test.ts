import { describe, expect, it } from 'vitest';

import { findVariableRoleConflicts } from '../findVariableRoleConflicts.ts';
import { createBaseProtocol } from '../test-utils.ts';

// Minimal stage builders over the base protocol's `person` node type.
const egoFormStage = (variable: string) => ({
  id: 'ef1',
  type: 'EgoForm',
  label: 'About you',
  introductionPanel: { title: 'T', text: 'X' },
  form: { fields: [{ variable, prompt: 'Answer' }] },
});

const alterFormStage = (variable: string) => ({
  id: 'af1',
  type: 'AlterForm',
  label: 'Alter form',
  subject: { entity: 'node', type: 'person' },
  introductionPanel: { title: 'T', text: 'X' },
  form: { fields: [{ variable, prompt: 'Answer' }] },
});

const categoricalBinStage = (variable: string) => ({
  id: 'cb1',
  type: 'CategoricalBin',
  label: 'Bin',
  subject: { entity: 'node', type: 'person' },
  prompts: [{ id: 'p1', text: 'Sort', variable }],
});

// FamilyPedigree's form fields resolve against the stage's `subject`, like any
// other form.
const familyPedigreeStage = (formVariable: string) => ({
  id: 'fp1',
  type: 'FamilyPedigree',
  label: 'Family Pedigree',
  subject: { entity: 'node', type: 'person' },
  prompt: 'Who is related to you?',
  nodeConfiguration: {
    nameVariable: 'pedigreeName',
    genderIdentityVariable: 'pedigreeGender',
    sexAssignedAtBirthVariable: 'pedigreeSab',
    egoVariable: 'pedigreeEgo',
  },
  edgeConfiguration: {
    type: 'knows',
    kindVariable: 'pedigreeKind',
    gestationalCarrierVariable: 'pedigreeGestCarrier',
    currentPartnerVariable: 'pedigreeCurrent',
  },
  form: { fields: [{ variable: formVariable, prompt: 'Family history' }] },
});

const withStages = (stages: unknown[]) => {
  const base = createBaseProtocol();
  return { ...base, stages: [...(base.stages as unknown[]), ...stages] };
};

describe('findVariableRoleConflicts', () => {
  it('flags a variable used by both a form field and a bin prompt', () => {
    const conflicts = findVariableRoleConflicts(
      withStages([alterFormStage('category'), categoricalBinStage('category')]),
    );
    expect(conflicts).toHaveLength(1);
    const conflict = conflicts[0];
    expect(conflict?.variableId).toBe('category');
    expect(conflict?.subject).toEqual({ entity: 'node', type: 'person' });
    expect(conflict?.variableName).toBe('Category');
    expect(conflict?.validated).toHaveLength(1);
    expect(conflict?.unvalidated).toHaveLength(1);
    expect(typeof conflict?.unvalidated[0]?.stageIndex).toBe('number');
  });

  it('resolves the subject of a FamilyPedigree form field', () => {
    const conflicts = findVariableRoleConflicts(
      withStages([
        categoricalBinStage('category'),
        familyPedigreeStage('category'),
      ]),
    );
    expect(conflicts).toHaveLength(1);
    const conflict = conflicts[0];
    expect(conflict?.variableId).toBe('category');
    expect(conflict?.subject).toEqual({ entity: 'node', type: 'person' });
    expect(conflict?.validated).toHaveLength(1);
    expect(conflict?.unvalidated).toHaveLength(1);
  });

  it('falls back to the variable id for a variableName absent from the codebook', () => {
    const conflicts = findVariableRoleConflicts(
      withStages([alterFormStage('ghost'), categoricalBinStage('ghost')]),
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.variableName).toBe('ghost');
  });

  it('accepts same-class sharing', () => {
    expect(
      findVariableRoleConflicts(
        withStages([
          categoricalBinStage('category'),
          { ...categoricalBinStage('category'), id: 'cb2' },
        ]),
      ),
    ).toEqual([]);
  });

  it('does not conflate identically-named variables on different subjects', () => {
    // ego form writes ego "category"; bin writes person "category" — no conflict
    const base = createBaseProtocol() as Record<string, unknown> & {
      codebook: { ego: { variables: Record<string, unknown> } };
    };
    base.codebook.ego.variables = {
      ...base.codebook.ego.variables,
      category: {
        name: 'ego_category',
        type: 'categorical',
        options: [
          { label: 'A', value: 'a' },
          { label: 'B', value: 'b' },
        ],
      },
    };
    const conflicts = findVariableRoleConflicts({
      ...base,
      stages: [
        ...(base.stages as unknown[]),
        egoFormStage('category'),
        categoricalBinStage('category'),
      ],
    });
    expect(conflicts).toEqual([]);
  });

  it('ignores untagged read-only references', () => {
    expect(findVariableRoleConflicts(withStages([]))).toEqual([]);
  });
});
