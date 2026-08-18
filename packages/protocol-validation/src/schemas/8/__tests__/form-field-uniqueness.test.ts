import { describe, expect, it } from 'vitest';

import { createBaseProtocol } from '../../../utils/test-utils.ts';
import { FormSchema, TitlelessFormSchema } from '../common/index.ts';
import ProtocolSchemaV8 from '../schema.ts';
import { familyPedigreeStage } from '../stages/family-pedigree.ts';

const field = (variable: string, prompt: string) => ({ variable, prompt });

// Mirrors `narrative-pedigree.test.ts`'s pedigree fixture: FamilyPedigree
// declares no top-level subject, so `nodeConfig.form` is the one form surface
// that never passes through FormSchema/TitlelessFormSchema.
const pedigreeStage = (form?: { variable: string; prompt: string }[]) => ({
  id: 'fp1',
  label: 'Family Pedigree',
  type: 'FamilyPedigree' as const,
  nodeConfig: {
    type: 'person',
    nodeLabelVariable: 'name',
    egoVariable: 'isEgo',
    relationshipVariable: 'relationship',
    biologicalSexVariable: 'bioSex',
    ...(form ? { form } : {}),
  },
  edgeConfig: {
    type: 'knows',
    relationshipTypeVariable: 'relType',
    isActiveVariable: 'isActive',
    isGestationalCarrierVariable: 'isGc',
    gameteRoleVariable: 'gameteRole',
  },
  censusPrompt: 'Build your family',
  framing: { mode: 'fixed' as const, value: 'gamete' as const },
  boundaries: {
    requireGrandparents: 'off' as const,
    requireChildrenContributors: 'off' as const,
  },
});

const pedigreeProtocol = (form?: { variable: string; prompt: string }[]) => {
  const protocol = createBaseProtocol();
  return {
    ...protocol,
    codebook: {
      ...protocol.codebook,
      node: {
        ...protocol.codebook.node,
        person: {
          ...protocol.codebook.node.person,
          variables: {
            ...protocol.codebook.node.person.variables,
            isEgo: { name: 'IsEgo', type: 'boolean' },
            relationship: { name: 'Relationship', type: 'text' },
            bioSex: { name: 'BioSex', type: 'text' },
          },
        },
      },
      edge: {
        ...protocol.codebook.edge,
        knows: {
          ...protocol.codebook.edge.knows,
          variables: {
            ...protocol.codebook.edge.knows.variables,
            relType: { name: 'RelType', type: 'text' },
            isActive: { name: 'IsActive', type: 'boolean' },
            isGc: { name: 'IsGc', type: 'boolean' },
            gameteRole: { name: 'GameteRole', type: 'text' },
          },
        },
      },
    },
    stages: [pedigreeStage(form)],
  };
};

describe('form field variable uniqueness', () => {
  it('accepts a form whose fields each name a different variable', () => {
    expect(
      FormSchema.safeParse({
        title: 'Add a person',
        fields: [field('name', 'Name?'), field('age', 'Age?')],
      }).success,
    ).toBe(true);
  });

  it('rejects a FormSchema form that names one variable twice', () => {
    const result = FormSchema.safeParse({
      title: 'Add a person',
      fields: [
        field('name', 'Name?'),
        field('age', 'Age?'),
        field('name', 'Name again?'),
      ],
    });
    expect(result.success).toBe(false);
    // The path must land on the offending field's own `variable` so Architect's
    // Issues anchor resolves to the picker that has to change.
    expect(result.error?.issues.map((issue) => issue.path)).toContainEqual([
      'fields',
      2,
      'variable',
    ]);
  });

  it('rejects a TitlelessFormSchema form that names one variable twice', () => {
    const result = TitlelessFormSchema.safeParse({
      fields: [field('name', 'Name?'), field('name', 'Name again?')],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path)).toContainEqual([
      'fields',
      1,
      'variable',
    ]);
  });

  it('rejects a FamilyPedigree nodeConfig.form that names one variable twice', () => {
    const result = familyPedigreeStage.safeParse(
      pedigreeStage([field('age', 'Age?'), field('age', 'Age again?')]),
    );
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path)).toContainEqual([
      'nodeConfig',
      'form',
      1,
      'variable',
    ]);
  });

  it('accepts a FamilyPedigree nodeConfig.form with distinct variables', () => {
    expect(
      familyPedigreeStage.safeParse(
        pedigreeStage([field('age', 'Age?'), field('category', 'Category?')]),
      ).success,
    ).toBe(true);
  });

  it('rejects the duplicate through whole-protocol validation', () => {
    const result = ProtocolSchemaV8.safeParse(
      pedigreeProtocol([field('age', 'Age?'), field('age', 'Age again?')]),
    );
    expect(result.success).toBe(false);
    expect(
      result.error?.issues.some(
        (issue) =>
          issue.message === 'Form fields contain duplicate attribute "age"',
      ),
    ).toBe(true);
  });

  it('accepts an AlterForm whose fields are distinct', () => {
    const protocol = createBaseProtocol();
    const result = ProtocolSchemaV8.safeParse({
      ...protocol,
      stages: [
        ...protocol.stages,
        {
          id: 'af1',
          type: 'AlterForm',
          label: 'Alter form',
          subject: { entity: 'node', type: 'person' },
          introductionPanel: { title: 'T', text: 'X' },
          form: { fields: [field('name', 'Name?'), field('age', 'Age?')] },
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an AlterForm that repeats a variable', () => {
    const protocol = createBaseProtocol();
    const result = ProtocolSchemaV8.safeParse({
      ...protocol,
      stages: [
        ...protocol.stages,
        {
          id: 'af1',
          type: 'AlterForm',
          label: 'Alter form',
          subject: { entity: 'node', type: 'person' },
          introductionPanel: { title: 'T', text: 'X' },
          form: { fields: [field('name', 'Name?'), field('name', 'Again?')] },
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});
