import { describe, expect, it } from 'vitest';

import { repairConfigurationConflicts } from '../../../utils/repairConfigurationConflicts.ts';
import { createBaseProtocol } from '../../../utils/test-utils.ts';
import { FormSchema, TitlelessFormSchema } from '../common/index.ts';
import ProtocolSchemaV8 from '../schema.ts';
import { familyPedigreeStage } from '../stages/family-pedigree.ts';

const field = (variable: string, prompt: string) => ({ variable, prompt });

// The FamilyPedigree node form of the single stage in `pedigreeProtocol`.
const valueAtNodeForm = (protocol: unknown): unknown => {
  const stages = (protocol as { stages?: unknown[] }).stages ?? [];
  const nodeConfig = (stages[0] as { nodeConfig?: { form?: unknown } })
    .nodeConfig;
  return nodeConfig?.form;
};

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

  // The schema, the repair Architect offers, and the v7→v8 migration all ask
  // one question, through `duplicateFormFieldIndices`. If they answered
  // differently the repair would either drop a field the schema was happy with,
  // or leave a protocol the schema still rejects — asking the researcher to
  // approve a fix that fixes nothing every time they open it.
  it('the schema and the repair name exactly the same repeated fields', () => {
    const fields = [
      field('age', 'First'),
      field('name', 'Name?'),
      field('age', 'Second'),
      field('age', 'Third'),
    ];
    const protocol = pedigreeProtocol(fields);

    const result = ProtocolSchemaV8.safeParse(protocol);
    const flaggedBySchema = (result.error?.issues ?? [])
      .filter(
        (issue) =>
          issue.message === 'Form fields contain duplicate attribute "age"',
      )
      .map((issue) => issue.path[issue.path.length - 2]);
    expect(flaggedBySchema).toEqual([2, 3]);

    const repaired = repairConfigurationConflicts(protocol);
    expect(repaired.repairable).toBe(true);
    const keptPrompts = (
      valueAtNodeForm(repaired.protocol) as { prompt: string }[]
    ).map((kept) => kept.prompt);
    expect(keptPrompts).toEqual(['First', 'Name?']);
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
