import { describe, expect, it } from 'vitest';

import { withFinishStage } from '../../../../__tests__/finishStage.ts';
import { localized } from '../../../../utils/test-utils.ts';
import { NodeColorSequence } from '../../color-reference.ts';
import ProtocolSchemaV9 from '../../schema.ts';
import { narrativePedigreeStage } from '../narrative-pedigree.ts';

// Minimal valid FamilyPedigree stage (source).
// Node variables are on 'person', edge variables are on 'family' (distinct keys).
// egoVariable lives on the FamilyPedigree node type and marks which node is ego.
const validFamilyPedigreeStage = {
  id: 'fp1',
  label: localized('FamilyPedigree'),
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
  censusPrompt: localized('Build your family'),
  framing: { mode: 'fixed' as const, value: 'gamete' as const },
  boundaries: {
    requireGrandparents: 'off' as const,
    requireChildrenContributors: 'off' as const,
  },
};

// Minimal valid NarrativePedigree stage (stage-level shape only)
const validNarrativePedigreeStageShape = {
  id: 'np1',
  label: localized('Narrative Pedigree'),
  type: 'NarrativePedigree' as const,
  sourceStageId: 'fp1',
  diseases: [
    {
      id: 'disease1',
      label: localized('Breast Cancer'),
      color: 'node-color-seq-1',
      variable: 'hasBreastCancer',
      inheritancePattern: 'autosomalDominant' as const,
    },
  ],
};

// Minimal protocol with a FamilyPedigree source stage and NarrativePedigree
const makeProtocol = (overrides?: {
  stages?: unknown[];
  codebook?: unknown;
  localization?: { defaultLocale: string; locales: string[] };
}) => ({
  name: 'Test Protocol',
  schemaVersion: 9 as const,
  localization: overrides?.localization ?? {
    defaultLocale: 'en',
    locales: ['en'],
  },
  codebook: overrides?.codebook ?? {
    node: {
      person: {
        name: 'Person',
        label: localized('Person'),
        color: 'node-color-seq-1',
        shape: { default: 'circle' as const },
        variables: {
          egoIsEgo: {
            name: 'EgoIsEgo',
            label: 'EgoIsEgo',
            type: 'boolean',
          },
          personLabel: {
            name: 'PersonLabel',
            label: 'PersonLabel',
            type: 'text',
          },
          personRel: {
            name: 'PersonRel',
            label: 'PersonRel',
            type: 'text',
          },
          personBioSex: {
            name: 'PersonBioSex',
            label: 'PersonBioSex',
            type: 'text',
          },
          hasBreastCancer: {
            name: 'HasBreastCancer',
            label: 'HasBreastCancer',
            type: 'boolean',
          },
          hasOvarianCancer: {
            name: 'HasOvarianCancer',
            label: 'HasOvarianCancer',
            type: 'boolean',
          },
        },
      },
    },
    edge: {
      family: {
        name: 'Family',
        label: localized('Family'),
        color: 'edge-color-seq-1',
        variables: {
          familyRelType: {
            name: 'FamilyRelType',
            label: 'FamilyRelType',
            type: 'text',
          },
          familyIsActive: {
            name: 'FamilyIsActive',
            label: 'FamilyIsActive',
            type: 'boolean',
          },
          familyIsGc: {
            name: 'FamilyIsGc',
            label: 'FamilyIsGc',
            type: 'boolean',
          },
          familyGameteRole: {
            name: 'FamilyGameteRole',
            label: 'FamilyGameteRole',
            type: 'text',
          },
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
          label: localized('A'),
          color: 'node-color-seq-1',
          variable: 'v1',
          inheritancePattern: 'autosomalDominant' as const,
        },
        {
          id: 'dup',
          label: localized('B'),
          color: 'node-color-seq-5',
          variable: 'v2',
          inheritancePattern: 'yLinked' as const,
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects two diseases mapped to the same variable', () => {
    const result = narrativePedigreeStage.safeParse({
      ...validNarrativePedigreeStageShape,
      diseases: [
        {
          id: 'd1',
          label: localized('Condition X'),
          color: 'node-color-seq-1',
          variable: 'shared',
          inheritancePattern: 'autosomalDominant' as const,
        },
        {
          id: 'd2',
          label: localized('Condition Y'),
          color: 'node-color-seq-5',
          variable: 'shared',
          inheritancePattern: 'yLinked' as const,
        },
      ],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path)).toContainEqual([
      'diseases',
      1,
      'variable',
    ]);
  });

  it('accepts two diseases with distinct labels and variables', () => {
    const result = narrativePedigreeStage.safeParse({
      ...validNarrativePedigreeStageShape,
      diseases: [
        {
          id: 'd1',
          label: localized('Condition X'),
          color: 'node-color-seq-1',
          variable: 'v1',
          inheritancePattern: 'autosomalDominant' as const,
        },
        {
          id: 'd2',
          label: localized('Condition Y'),
          color: 'node-color-seq-5',
          variable: 'v2',
          inheritancePattern: 'yLinked' as const,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty disease label', () => {
    const result = narrativePedigreeStage.safeParse({
      ...validNarrativePedigreeStageShape,
      diseases: [
        {
          ...validNarrativePedigreeStageShape.diseases[0],
          label: localized(''),
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  // A disease colours nodes in the pedigree, so it must name one of the eight
  // node palette values the interface can render. `node-color-seq-9` and
  // `node-color-seq-10` are the interesting rejections: Architect Classic
  // offered those two positions, so they look plausible and are not — the
  // v7→v8 migration wraps them, and anything still carrying one here was
  // authored against this schema and has to be told.
  it.each([
    '',
    '#ff0000',
    'edge-color-seq-1',
    'node-color-seq-9',
    'node-color-seq-10',
  ])(
    'rejects disease color %j because it is not a node color reference',
    (color) => {
      const result = narrativePedigreeStage.safeParse({
        ...validNarrativePedigreeStageShape,
        diseases: [{ ...validNarrativePedigreeStageShape.diseases[0], color }],
      });
      expect(result.success).toBe(false);
      // The message has to list the colours that ARE allowed: the researcher
      // is picking one, and "invalid" alone does not tell them from what.
      expect(!result.success && result.error.issues).toContainEqual(
        expect.objectContaining({
          message: `Invalid option: expected one of ${NodeColorSequence.map(
            (value) => `"${value}"`,
          ).join('|')}`,
          path: ['diseases', 0, 'color'],
        }),
      );
    },
  );

  it('rejects unknown keys (presets and behaviours are no longer part of the schema)', () => {
    const result = narrativePedigreeStage.safeParse({
      ...validNarrativePedigreeStageShape,
      presets: [
        {
          id: 'preset1',
          label: localized('Breast Cancer Focus'),
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
    const result = ProtocolSchemaV9.safeParse(withFinishStage(makeProtocol()));
    expect(result.success).toBe(true);
  });

  const protocolWithDiseaseLabels = (
    labels: [Record<string, string>, Record<string, string>],
    localization?: { defaultLocale: string; locales: string[] },
  ) =>
    makeProtocol({
      localization,
      stages: [
        validFamilyPedigreeStage,
        {
          ...validNarrativePedigreeStageShape,
          diseases: [
            {
              id: 'd1',
              label: labels[0],
              color: 'node-color-seq-1',
              variable: 'hasBreastCancer',
              inheritancePattern: 'autosomalDominant',
            },
            {
              id: 'd2',
              label: labels[1],
              color: 'node-color-seq-5',
              variable: 'hasOvarianCancer',
              inheritancePattern: 'yLinked',
            },
          ],
        },
      ],
    });

  const duplicateLabelIssues = (protocol: unknown) => {
    const result = ProtocolSchemaV9.safeParse(withFinishStage(protocol));
    return result.success
      ? []
      : result.error.issues.filter((issue) =>
          issue.message.startsWith('Diseases contain duplicate label'),
        );
  };

  it('rejects two diseases sharing a label, ignoring case and surrounding space', () => {
    const issues = duplicateLabelIssues(
      protocolWithDiseaseLabels([
        localized('Condition X'),
        localized('  condition x '),
      ]),
    );
    expect(issues.map((issue) => issue.path)).toEqual([
      ['stages', 1, 'diseases', 1, 'label'],
    ]);
  });

  // Canonical equivalence: `Café` written with U+00E9 and `Cafe` + U+0301 are
  // the same text, render identically in every font, and are produced
  // interchangeably by different keyboards and paste sources — so they are one
  // key in the participant-facing disease legend.
  it('rejects two diseases whose labels are canonically equivalent spellings', () => {
    const issues = duplicateLabelIssues(
      protocolWithDiseaseLabels([
        localized('Caf\u00e9 Coronary'),
        localized('Cafe\u0301 Coronary'),
      ]),
    );
    expect(issues.map((issue) => issue.path)).toEqual([
      ['stages', 1, 'diseases', 1, 'label'],
    ]);
  });

  // Node offers no way to change the process's default locale from inside a
  // test, and `toLocaleLowerCase()` with no argument folds by exactly that. So
  // stand in for a Turkish host: under it `I` lowercases to `ı` rather than
  // `i`, which is what would let this one protocol be valid on one researcher's
  // laptop and invalid on another's.
  const withTurkishHostLocale = (run: () => void) => {
    const original = String.prototype.toLocaleLowerCase;
    String.prototype.toLocaleLowerCase = function (this: string) {
      return original.call(this, 'tr');
    };
    try {
      run();
    } finally {
      String.prototype.toLocaleLowerCase = original;
    }
  };

  it('gives the same duplicate-label verdict whatever the host locale', () => {
    const protocol = protocolWithDiseaseLabels([
      localized('Ilk'),
      localized('ilk'),
    ]);

    expect(duplicateLabelIssues(protocol)).toHaveLength(1);
    withTurkishHostLocale(() => {
      expect(duplicateLabelIssues(protocol)).toHaveLength(1);
    });
  });

  // The second row has no French text, so a French participant sees its
  // English label, which is exactly the first row's French label.
  it('rejects a collision that only appears through fallback, in the locale it affects', () => {
    const issues = duplicateLabelIssues(
      protocolWithDiseaseLabels(
        [{ en: 'Breast cancer', fr: 'Cancer' }, { en: 'Cancer' }],
        { defaultLocale: 'en', locales: ['en', 'fr'] },
      ),
    );
    expect(issues).toEqual([
      expect.objectContaining({
        message: 'Diseases contain duplicate label "Cancer" (fr)',
        path: ['stages', 1, 'diseases', 1, 'label'],
      }),
    ]);
  });

  it('accepts labels that are distinct in every declared locale', () => {
    const result = ProtocolSchemaV9.safeParse(
      withFinishStage(
        protocolWithDiseaseLabels(
          [
            { en: 'Cancer', fr: 'Tumeur' },
            { en: 'Tumour', fr: 'Cancer du sein' },
          ],
          { defaultLocale: 'en', locales: ['en', 'fr'] },
        ),
      ),
    );
    expect(result.success).toBe(true);
  });

  it('rejects when sourceStageId does not reference any stage', () => {
    const result = ProtocolSchemaV9.safeParse(
      withFinishStage(
        makeProtocol({
          stages: [
            validFamilyPedigreeStage,
            {
              ...validNarrativePedigreeStageShape,
              sourceStageId: 'nonexistent',
            },
          ],
        }),
      ),
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
    const informationStage = {
      id: 'info1',
      label: localized('Information'),
      type: 'Information' as const,
      title: localized('Welcome'),
      items: [{ id: 'i1', type: 'text' as const, content: localized('Hello') }],
    };
    const result = ProtocolSchemaV9.safeParse(
      withFinishStage(
        makeProtocol({
          stages: [
            informationStage,
            { ...validNarrativePedigreeStageShape, sourceStageId: 'info1' },
          ],
        }),
      ),
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
    const result = ProtocolSchemaV9.safeParse(
      withFinishStage(
        makeProtocol({
          stages: [
            validFamilyPedigreeStage,
            {
              ...validNarrativePedigreeStageShape,
              diseases: [
                {
                  id: 'disease1',
                  label: localized('Breast Cancer'),
                  color: 'node-color-seq-1',
                  variable: 'nonexistentVariable',
                  inheritancePattern: 'autosomalDominant',
                },
              ],
            },
          ],
        }),
      ),
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
    const result = ProtocolSchemaV9.safeParse(
      withFinishStage(
        makeProtocol({
          stages: [
            validFamilyPedigreeStage,
            {
              ...validNarrativePedigreeStageShape,
              diseases: [
                {
                  id: 'disease1',
                  label: localized('Breast Cancer'),
                  color: 'node-color-seq-1',
                  variable: 'personBioSex',
                  inheritancePattern: 'autosomalDominant',
                },
              ],
            },
          ],
        }),
      ),
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
    const result = ProtocolSchemaV9.safeParse(
      withFinishStage(
        makeProtocol({
          stages: [
            {
              ...validFamilyPedigreeStage,
              nominationPrompts: [
                {
                  id: 'nom1',
                  text: localized('Who is affected?'),
                  variable: 'hasBreastCancer',
                },
              ],
            },
            validNarrativePedigreeStageShape,
          ],
        }),
      ),
    );
    expect(result.success).toBe(true);
  });

  it('rejects a FamilyPedigree nomination prompt whose variable is missing from the codebook', () => {
    const result = ProtocolSchemaV9.safeParse(
      withFinishStage(
        makeProtocol({
          stages: [
            {
              ...validFamilyPedigreeStage,
              nominationPrompts: [
                {
                  id: 'nom1',
                  text: localized('Who is affected?'),
                  variable: 'ghostVar',
                },
              ],
            },
            validNarrativePedigreeStageShape,
          ],
        }),
      ),
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
    const result = ProtocolSchemaV9.safeParse(
      withFinishStage(
        makeProtocol({
          stages: [
            {
              ...validFamilyPedigreeStage,
              nominationPrompts: [
                {
                  id: 'nom1',
                  text: localized('Who is affected?'),
                  variable: 'personRel',
                },
              ],
            },
            validNarrativePedigreeStageShape,
          ],
        }),
      ),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) =>
        i.message.includes('must be a boolean'),
      );
      expect(issue).toBeDefined();
    }
  });

  it('rejects a FamilyPedigree nodeConfig.form field whose variable has no component', () => {
    const result = ProtocolSchemaV9.safeParse(
      withFinishStage(
        makeProtocol({
          stages: [
            {
              ...validFamilyPedigreeStage,
              nodeConfig: {
                ...validFamilyPedigreeStage.nodeConfig,
                form: [{ variable: 'personLabel', prompt: localized('Name?') }],
              },
            },
            validNarrativePedigreeStageShape,
          ],
        }),
      ),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) =>
        i.message.includes('must define a component'),
      );
      expect(issue).toBeDefined();
    }
  });

  it('accepts a FamilyPedigree nodeConfig.form field whose variable has a component', () => {
    const result = ProtocolSchemaV9.safeParse(
      withFinishStage(
        makeProtocol({
          codebook: {
            node: {
              person: {
                name: 'Person',
                label: localized('Person'),
                color: 'node-color-seq-1',
                shape: { default: 'circle' as const },
                variables: {
                  egoIsEgo: {
                    name: 'EgoIsEgo',
                    label: 'EgoIsEgo',
                    type: 'boolean',
                  },
                  personLabel: {
                    name: 'PersonLabel',
                    label: 'PersonLabel',
                    type: 'text',
                    component: 'Text',
                  },
                  personRel: {
                    name: 'PersonRel',
                    label: 'PersonRel',
                    type: 'text',
                  },
                  personBioSex: {
                    name: 'PersonBioSex',
                    label: 'PersonBioSex',
                    type: 'text',
                  },
                  hasBreastCancer: {
                    name: 'HasBreastCancer',
                    label: 'HasBreastCancer',
                    type: 'boolean',
                  },
                },
              },
            },
            edge: {
              family: {
                name: 'Family',
                label: localized('Family'),
                color: 'edge-color-seq-1',
                variables: {
                  familyRelType: {
                    name: 'FamilyRelType',
                    label: 'FamilyRelType',
                    type: 'text',
                  },
                  familyIsActive: {
                    name: 'FamilyIsActive',
                    label: 'FamilyIsActive',
                    type: 'boolean',
                  },
                  familyIsGc: {
                    name: 'FamilyIsGc',
                    label: 'FamilyIsGc',
                    type: 'boolean',
                  },
                  familyGameteRole: {
                    name: 'FamilyGameteRole',
                    label: 'FamilyGameteRole',
                    type: 'text',
                  },
                },
              },
            },
          },
          stages: [
            {
              ...validFamilyPedigreeStage,
              nodeConfig: {
                ...validFamilyPedigreeStage.nodeConfig,
                form: [{ variable: 'personLabel', prompt: localized('Name?') }],
              },
            },
            validNarrativePedigreeStageShape,
          ],
        }),
      ),
    );
    expect(result.success).toBe(true);
  });
});
