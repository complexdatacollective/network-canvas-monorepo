import { describe, expect, it } from 'vitest';

import { withFinishStage } from '../../../../__tests__/finishStage.ts';
import { localized, localizedOptions } from '../../../../utils/test-utils.ts';
import { pedigreeNameField } from '../../__tests__/family-pedigree-text.ts';
import { NodeColorSequence } from '../../color-reference.ts';
import {
  PEDIGREE_RELATIONSHIP_KIND_OPTIONS,
  PEDIGREE_SEX_ASSIGNED_AT_BIRTH_OPTIONS,
} from '../../family-pedigree-values.ts';
import ProtocolSchemaV9 from '../../schema.ts';
import { familyPedigreeWordingIn } from '../../stage-wording/family-pedigree.ts';
import { narrativePedigreeStage } from '../narrative-pedigree.ts';

// Minimal valid FamilyPedigree stage (source). Its person type is its stage
// subject, which the Narrative Pedigree's diseases resolve against.
const validFamilyPedigreeStage = {
  id: 'fp1',
  label: localized('FamilyPedigree'),
  type: 'FamilyPedigree' as const,
  wording: familyPedigreeWordingIn('en'),
  subject: { entity: 'node' as const, type: 'person' },
  prompt: localized('Build your family'),
  nodeConfiguration: {
    nameAttribute: 'personLabel',
    nameField: pedigreeNameField(),
    sexAssignedAtBirthAttribute: 'personSab',
    egoAttribute: 'egoIsEgo',
  },
  edgeConfiguration: {
    type: 'family',
    kindAttribute: 'familyKind',
    gestationalCarrierAttribute: 'familyIsGc',
    currentPartnerAttribute: 'familyIsCurrent',
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
      attribute: 'hasBreastCancer',
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
          personSab: {
            name: 'PersonSab',
            label: 'PersonSab',
            type: 'categorical',
            options: localizedOptions(PEDIGREE_SEX_ASSIGNED_AT_BIRTH_OPTIONS),
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
          familyKind: {
            name: 'FamilyKind',
            label: 'FamilyKind',
            type: 'categorical',
            options: localizedOptions(PEDIGREE_RELATIONSHIP_KIND_OPTIONS),
          },
          familyIsGc: {
            name: 'FamilyIsGc',
            label: 'FamilyIsGc',
            type: 'boolean',
          },
          familyIsCurrent: {
            name: 'FamilyIsCurrent',
            label: 'FamilyIsCurrent',
            type: 'boolean',
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
          attribute: 'v1',
          inheritancePattern: 'autosomalDominant' as const,
        },
        {
          id: 'dup',
          label: localized('B'),
          color: 'node-color-seq-5',
          attribute: 'v2',
          inheritancePattern: 'yLinked' as const,
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects two diseases mapped to the same attribute', () => {
    const result = narrativePedigreeStage.safeParse({
      ...validNarrativePedigreeStageShape,
      diseases: [
        {
          id: 'd1',
          label: localized('Condition X'),
          color: 'node-color-seq-1',
          attribute: 'shared',
          inheritancePattern: 'autosomalDominant' as const,
        },
        {
          id: 'd2',
          label: localized('Condition Y'),
          color: 'node-color-seq-5',
          attribute: 'shared',
          inheritancePattern: 'yLinked' as const,
        },
      ],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path)).toContainEqual([
      'diseases',
      1,
      'attribute',
    ]);
  });

  it('accepts two diseases with distinct labels and attributes', () => {
    const result = narrativePedigreeStage.safeParse({
      ...validNarrativePedigreeStageShape,
      diseases: [
        {
          id: 'd1',
          label: localized('Condition X'),
          color: 'node-color-seq-1',
          attribute: 'v1',
          inheritancePattern: 'autosomalDominant' as const,
        },
        {
          id: 'd2',
          label: localized('Condition Y'),
          color: 'node-color-seq-5',
          attribute: 'v2',
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
              attribute: 'hasBreastCancer',
              inheritancePattern: 'autosomalDominant',
            },
            {
              id: 'd2',
              label: labels[1],
              color: 'node-color-seq-5',
              attribute: 'hasOvarianCancer',
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

  // The narrative shows the family the participant drew, so a pedigree that
  // runs after it has drawn nothing yet when the narrative opens.
  it('rejects a source FamilyPedigree that comes after the narrative', () => {
    const result = ProtocolSchemaV9.safeParse(
      withFinishStage(
        makeProtocol({
          stages: [validNarrativePedigreeStageShape, validFamilyPedigreeStage],
        }),
      ),
    );
    expect(
      result.error?.issues.map(({ message, path }) => ({ message, path })),
    ).toContainEqual({
      message:
        'NarrativePedigree sourceStageId "fp1" must reference a FamilyPedigree stage that comes before it.',
      path: ['stages', 0, 'sourceStageId'],
    });
  });

  it('accepts a source FamilyPedigree that comes before the narrative', () => {
    const result = ProtocolSchemaV9.safeParse(
      withFinishStage(
        makeProtocol({
          stages: [validFamilyPedigreeStage, validNarrativePedigreeStageShape],
        }),
      ),
    );
    expect(result.error?.issues ?? []).toEqual([]);
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

  it('rejects when a disease attribute does not exist on the source node type', () => {
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
                  attribute: 'nonexistentVariable',
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

  it('rejects when a disease attribute is not a boolean', () => {
    // personLabel is a 'text' attribute; the affection predicate is boolean.
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
                  attribute: 'personLabel',
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
});
