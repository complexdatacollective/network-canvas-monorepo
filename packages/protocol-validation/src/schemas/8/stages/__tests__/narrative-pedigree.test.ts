import { describe, expect, it } from 'vitest';

import ProtocolSchemaV8 from '~/schemas/8/schema';

import { narrativePedigreeStage } from '../narrative-pedigree';

// Minimal valid FamilyPedigree stage (source).
// Node variables are on 'person', edge variables are on 'family' (distinct keys).
// egoVariable lives on the FamilyPedigree node type and marks which node is ego.
const validFamilyPedigreeStage = {
  id: 'fp1',
  label: 'FamilyPedigree',
  type: 'FamilyPedigree' as const,
  nodeConfig: {
    type: 'person',
    nodeLabelVariable: 'personLabel',
    egoVariable: 'egoIsEgo',
    relationshipVariable: 'personRel',
    biologicalSexVariable: 'personBioSex',
  },
  edgeConfig: {
    type: 'family',
    relationshipTypeVariable: 'familyRelType',
    isActiveVariable: 'familyIsActive',
    isGestationalCarrierVariable: 'familyIsGc',
    gameteRoleVariable: 'familyGameteRole',
  },
  censusPrompt: 'Build your family',
  framing: { mode: 'fixed' as const, value: 'gamete' as const },
  boundaries: {
    requireGrandparents: 'off' as const,
    requireChildrenContributors: 'off' as const,
  },
};

// Minimal valid NarrativePedigree stage (stage-level shape only)
const validNarrativePedigreeStageShape = {
  id: 'np1',
  label: 'Narrative Pedigree',
  type: 'NarrativePedigree' as const,
  sourceStageId: 'fp1',
  diseases: [
    {
      id: 'disease1',
      label: 'Breast Cancer',
      color: '#ff0000',
      variable: 'hasBreastCancer',
      inheritancePattern: 'autosomalDominant' as const,
    },
  ],
};

// Minimal protocol with a FamilyPedigree source stage and NarrativePedigree
const makeProtocol = (overrides?: {
  stages?: unknown[];
  codebook?: unknown;
}) => ({
  name: 'Test Protocol',
  schemaVersion: 8 as const,
  codebook: overrides?.codebook ?? {
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        shape: { default: 'circle' as const },
        variables: {
          egoIsEgo: { name: 'EgoIsEgo', type: 'boolean' },
          personLabel: { name: 'PersonLabel', type: 'text' },
          personRel: { name: 'PersonRel', type: 'text' },
          personBioSex: { name: 'PersonBioSex', type: 'text' },
          hasBreastCancer: { name: 'HasBreastCancer', type: 'boolean' },
        },
      },
    },
    edge: {
      family: {
        name: 'Family',
        color: 'edge-color-seq-1',
        variables: {
          familyRelType: { name: 'FamilyRelType', type: 'text' },
          familyIsActive: { name: 'FamilyIsActive', type: 'boolean' },
          familyIsGc: { name: 'FamilyIsGc', type: 'boolean' },
          familyGameteRole: { name: 'FamilyGameteRole', type: 'text' },
        },
      },
    },
  },
  stages: overrides?.stages ?? [
    validFamilyPedigreeStage,
    validNarrativePedigreeStageShape,
  ],
});

describe('narrativePedigreeStage (stage-level shape)', () => {
  it('accepts a valid NarrativePedigree stage shape', () => {
    const result = narrativePedigreeStage.safeParse(
      validNarrativePedigreeStageShape,
    );
    expect(result.success).toBe(true);
  });

  it('defaults showAtRiskStatuses to false when omitted', () => {
    const result = narrativePedigreeStage.safeParse(
      validNarrativePedigreeStageShape,
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.showAtRiskStatuses).toBe(false);
    }
  });

  it('accepts showAtRiskStatuses set to true', () => {
    const result = narrativePedigreeStage.safeParse({
      ...validNarrativePedigreeStageShape,
      showAtRiskStatuses: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.showAtRiskStatuses).toBe(true);
    }
  });

  it('rejects when diseases is empty', () => {
    const result = narrativePedigreeStage.safeParse({
      ...validNarrativePedigreeStageShape,
      diseases: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid inheritancePattern', () => {
    const result = narrativePedigreeStage.safeParse({
      ...validNarrativePedigreeStageShape,
      diseases: [
        {
          ...validNarrativePedigreeStageShape.diseases[0],
          inheritancePattern: 'notAPattern',
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects duplicate disease ids (stage-level)', () => {
    const result = narrativePedigreeStage.safeParse({
      ...validNarrativePedigreeStageShape,
      diseases: [
        {
          id: 'dup',
          label: 'A',
          color: '#f00',
          variable: 'v1',
          inheritancePattern: 'autosomalDominant' as const,
        },
        {
          id: 'dup',
          label: 'B',
          color: '#0f0',
          variable: 'v2',
          inheritancePattern: 'yLinked' as const,
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown keys (presets and behaviours are no longer part of the schema)', () => {
    const result = narrativePedigreeStage.safeParse({
      ...validNarrativePedigreeStageShape,
      presets: [
        {
          id: 'preset1',
          label: 'Breast Cancer Focus',
          diseases: ['disease1'],
          focal: 'ego',
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe('NarrativePedigree protocol-level cross-references', () => {
  it('accepts a valid protocol with FamilyPedigree source + NarrativePedigree', () => {
    const result = ProtocolSchemaV8.safeParse(makeProtocol());
    expect(result.success).toBe(true);
  });

  it('rejects when sourceStageId does not reference any stage', () => {
    const result = ProtocolSchemaV8.safeParse(
      makeProtocol({
        stages: [
          validFamilyPedigreeStage,
          { ...validNarrativePedigreeStageShape, sourceStageId: 'nonexistent' },
        ],
      }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) =>
        i.message.includes('sourceStageId'),
      );
      expect(issue).toBeDefined();
    }
  });

  it('rejects when sourceStageId references a non-FamilyPedigree stage', () => {
    const nameGenStage = {
      id: 'ng1',
      label: 'Name Generator',
      type: 'NameGenerator' as const,
      subject: { entity: 'node' as const, type: 'person' },
      form: { title: 'Add person', fields: [] },
      prompts: [{ id: 'p1', text: 'Who do you know?' }],
    };
    const result = ProtocolSchemaV8.safeParse(
      makeProtocol({
        stages: [
          nameGenStage,
          { ...validNarrativePedigreeStageShape, sourceStageId: 'ng1' },
        ],
      }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) =>
        i.message.includes('FamilyPedigree'),
      );
      expect(issue).toBeDefined();
    }
  });

  it('rejects when a disease variable does not exist on the source node type', () => {
    const result = ProtocolSchemaV8.safeParse(
      makeProtocol({
        stages: [
          validFamilyPedigreeStage,
          {
            ...validNarrativePedigreeStageShape,
            diseases: [
              {
                id: 'disease1',
                label: 'Breast Cancer',
                color: '#ff0000',
                variable: 'nonexistentVariable',
                inheritancePattern: 'autosomalDominant',
              },
            ],
          },
        ],
      }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) =>
        i.message.includes('nonexistentVariable'),
      );
      expect(issue).toBeDefined();
    }
  });

  it('rejects when a disease variable is not a boolean', () => {
    // personBioSex is a 'text' variable; the affection predicate is boolean.
    const result = ProtocolSchemaV8.safeParse(
      makeProtocol({
        stages: [
          validFamilyPedigreeStage,
          {
            ...validNarrativePedigreeStageShape,
            diseases: [
              {
                id: 'disease1',
                label: 'Breast Cancer',
                color: '#ff0000',
                variable: 'personBioSex',
                inheritancePattern: 'autosomalDominant',
              },
            ],
          },
        ],
      }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) =>
        i.message.includes('must be a boolean'),
      );
      expect(issue).toBeDefined();
    }
  });

  it('accepts a FamilyPedigree nomination prompt bound to a boolean variable', () => {
    const result = ProtocolSchemaV8.safeParse(
      makeProtocol({
        stages: [
          {
            ...validFamilyPedigreeStage,
            nominationPrompts: [
              {
                id: 'nom1',
                text: 'Who is affected?',
                variable: 'hasBreastCancer',
              },
            ],
          },
          validNarrativePedigreeStageShape,
        ],
      }),
    );
    expect(result.success).toBe(true);
  });

  it('rejects a FamilyPedigree nomination prompt whose variable is missing from the codebook', () => {
    const result = ProtocolSchemaV8.safeParse(
      makeProtocol({
        stages: [
          {
            ...validFamilyPedigreeStage,
            nominationPrompts: [
              { id: 'nom1', text: 'Who is affected?', variable: 'ghostVar' },
            ],
          },
          validNarrativePedigreeStageShape,
        ],
      }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) =>
        i.message.includes('ghostVar'),
      );
      expect(issue).toBeDefined();
    }
  });

  it('rejects a FamilyPedigree nomination prompt variable that is not a boolean', () => {
    // personRel is a 'text' variable; a nomination writes a boolean flag.
    const result = ProtocolSchemaV8.safeParse(
      makeProtocol({
        stages: [
          {
            ...validFamilyPedigreeStage,
            nominationPrompts: [
              { id: 'nom1', text: 'Who is affected?', variable: 'personRel' },
            ],
          },
          validNarrativePedigreeStageShape,
        ],
      }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) =>
        i.message.includes('must be a boolean'),
      );
      expect(issue).toBeDefined();
    }
  });
});
