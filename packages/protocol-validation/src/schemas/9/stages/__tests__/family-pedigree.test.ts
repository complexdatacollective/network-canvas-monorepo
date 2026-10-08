import { describe, expect, it } from 'vitest';

import { findExclusiveVariableConflicts } from '../../../../utils/findExclusiveVariableConflicts.ts';
import { localized, localizedOptions } from '../../../../utils/test-utils.ts';
import {
  GENDER_IDENTITY_OPTIONS,
  GENDER_IDENTITY_TERMS,
} from '../../__tests__/pedigreeGenderFixtures.ts';
import {
  PEDIGREE_RELATIONSHIP_KIND_OPTIONS,
  PEDIGREE_RELATIONSHIPS_TO_PARTICIPANT,
  PEDIGREE_SEX_ASSIGNED_AT_BIRTH_OPTIONS,
} from '../../family-pedigree-values.ts';
import ProtocolSchemaV9 from '../../schema.ts';
import {
  FAMILY_PEDIGREE_BUILD_PROMPT_ID,
  familyPedigreeStage,
} from '../family-pedigree.ts';

const base = {
  id: 'fp1',
  label: localized('Family Pedigree'),
  type: 'FamilyPedigree' as const,
  subject: { entity: 'node' as const, type: 'person' },
  prompt: localized('Draw your family'),
  nodeConfiguration: {
    nameAttribute: 'name',
    genderIdentity: { attribute: 'gender', terms: GENDER_IDENTITY_TERMS },
    sexAssignedAtBirthAttribute: 'sab',
    egoAttribute: 'isEgo',
  },
  edgeConfiguration: {
    type: 'family',
    kindAttribute: 'kind',
    gestationalCarrierAttribute: 'carrier',
    currentPartnerAttribute: 'current',
  },
};

const protocolWith = (
  stage: Record<string, unknown>,
  genderOptions: {
    value: string;
    label: Record<string, string>;
  }[] = GENDER_IDENTITY_OPTIONS,
) => ({
  name: 'Pedigree protocol',
  schemaVersion: 9 as const,
  localization: { defaultLocale: 'en', locales: ['en'] },
  codebook: {
    node: {
      person: {
        name: 'Person',
        label: localized('Person'),
        color: 'node-color-seq-1',
        shape: { default: 'circle' as const },
        variables: {
          name: {
            name: 'Name',
            label: 'Name',
            type: 'text' as const,
            component: 'Text',
          },
          isEgo: { name: 'IsEgo', label: 'IsEgo', type: 'boolean' as const },
          hd: {
            name: 'HeartDisease',
            label: 'HeartDisease',
            type: 'boolean' as const,
          },
          gender: {
            name: 'Gender',
            label: 'Gender',
            type: 'categorical' as const,
            options: genderOptions,
          },
          sab: {
            name: 'Sab',
            label: 'Sab',
            type: 'categorical' as const,
            options: localizedOptions(PEDIGREE_SEX_ASSIGNED_AT_BIRTH_OPTIONS),
          },
          rel: {
            name: 'Relationship',
            label: 'Relationship',
            type: 'categorical' as const,
            options: PEDIGREE_RELATIONSHIPS_TO_PARTICIPANT.map((value) => ({
              value,
              label: localized(value),
            })),
          },
          relText: {
            name: 'RelationshipText',
            label: 'RelationshipText',
            type: 'text' as const,
          },
          partial: {
            name: 'Partial',
            label: 'Partial',
            type: 'categorical' as const,
            options: [
              { value: 'parent', label: localized('Parent') },
              { value: 'sibling', label: localized('Sibling') },
            ],
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
          kind: {
            name: 'Kind',
            label: 'Kind',
            type: 'categorical' as const,
            options: localizedOptions(PEDIGREE_RELATIONSHIP_KIND_OPTIONS),
          },
          carrier: {
            name: 'Carrier',
            label: 'Carrier',
            type: 'boolean' as const,
          },
          current: {
            name: 'Current',
            label: 'Current',
            type: 'boolean' as const,
          },
        },
      },
    },
  },
  stages: [stage],
});

describe('familyPedigreeStage', () => {
  it('accepts a minimal stage', () => {
    expect(familyPedigreeStage.safeParse(base).success).toBe(true);
  });

  it('accepts each framing, or leaving it to the participant', () => {
    for (const framing of ['gendered', 'gamete', 'participantPreference']) {
      expect(familyPedigreeStage.safeParse({ ...base, framing }).success).toBe(
        true,
      );
    }
    expect(
      familyPedigreeStage.safeParse({ ...base, framing: 'neutral' }).success,
    ).toBe(false);
  });

  it('accepts researcher-defined person fields', () => {
    expect(
      familyPedigreeStage.safeParse({
        ...base,
        form: {
          fields: [{ variable: 'age', prompt: localized('How old are they?') }],
        },
      }).success,
    ).toBe(true);
  });

  it('requires nodeConfiguration', () => {
    const { nodeConfiguration: _omitted, ...withoutNodeConfiguration } = base;
    expect(
      familyPedigreeStage.safeParse(withoutNodeConfiguration).success,
    ).toBe(false);
  });

  it('requires every person attribute', () => {
    const { egoAttribute: _omitted, ...incomplete } = base.nodeConfiguration;
    expect(
      familyPedigreeStage.safeParse({ ...base, nodeConfiguration: incomplete })
        .success,
    ).toBe(false);
  });

  it('requires a relationship configuration', () => {
    const { edgeConfiguration: _omitted, ...withoutRelationship } = base;
    expect(familyPedigreeStage.safeParse(withoutRelationship).success).toBe(
      false,
    );
  });

  it('requires a non-empty prompt in every language given', () => {
    expect(
      familyPedigreeStage.safeParse({ ...base, prompt: localized('') }).success,
    ).toBe(false);
    expect(
      familyPedigreeStage.safeParse({ ...base, prompt: 'Draw your family' })
        .success,
    ).toBe(false);
  });

  it('accepts nomination prompts, optionally limited by sex at birth', () => {
    expect(
      familyPedigreeStage.safeParse({
        ...base,
        nominationPrompts: [
          {
            id: 'heart',
            text: localized('Who has had heart disease?'),
            attribute: 'hd',
          },
          {
            id: 'ovarian',
            text: localized('Who has had ovarian cancer?'),
            attribute: 'oc',
            onlyForSexAssignedAtBirth: 'female',
          },
        ],
      }).success,
    ).toBe(true);
  });

  it('rejects nomination prompts that reuse an id, or the family prompt id', () => {
    const prompt = { id: 'heart', text: localized('Who?'), attribute: 'hd' };
    expect(
      familyPedigreeStage.safeParse({
        ...base,
        nominationPrompts: [prompt, { ...prompt, attribute: 'other' }],
      }).success,
    ).toBe(false);
    expect(
      familyPedigreeStage.safeParse({
        ...base,
        nominationPrompts: [{ ...prompt, id: FAMILY_PEDIGREE_BUILD_PROMPT_ID }],
      }).success,
    ).toBe(false);
  });

  it('rejects an empty list of nomination prompts, or another limit', () => {
    expect(
      familyPedigreeStage.safeParse({ ...base, nominationPrompts: [] }).success,
    ).toBe(false);
    expect(
      familyPedigreeStage.safeParse({
        ...base,
        nominationPrompts: [
          {
            id: 'heart',
            text: localized('Who?'),
            attribute: 'hd',
            onlyForSexAssignedAtBirth: 'intersex',
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('rejects the keys of the retired census interface', () => {
    expect(
      familyPedigreeStage.safeParse({
        ...base,
        censusPrompt: localized('Build'),
      }).success,
    ).toBe(false);
  });
});

describe('FamilyPedigree in a whole protocol', () => {
  it('accepts a stage bound to correctly shaped codebook variables', () => {
    const result = ProtocolSchemaV9.safeParse(protocolWith(base));
    expect(result.success ? null : result.error.issues).toBeNull();
  });

  it('accepts gender identity words for an option the attribute no longer has', () => {
    const result = ProtocolSchemaV9.safeParse(
      protocolWith(
        base,
        localizedOptions([
          { value: 'woman', label: 'Woman' },
          { value: 'man', label: 'Man' },
        ]),
      ),
    );
    expect(result.success ? null : result.error.issues).toBeNull();
  });

  it('accepts a stage that does not ask about gender identity', () => {
    const { genderIdentity: _omitted, ...nodeConfiguration } =
      base.nodeConfiguration;
    const result = ProtocolSchemaV9.safeParse(
      protocolWith({ ...base, nodeConfiguration }),
    );
    expect(result.success ? null : result.error.issues).toBeNull();
  });

  it('refuses gender identity that names a variable but no words', () => {
    expect(
      familyPedigreeStage.safeParse({
        ...base,
        nodeConfiguration: {
          ...base.nodeConfiguration,
          genderIdentity: { attribute: 'gender' },
        },
      }).success,
    ).toBe(false);
  });

  it('requires each nomination prompt attribute to be a boolean', () => {
    const withNomination = (attribute: string) =>
      ProtocolSchemaV9.safeParse({
        ...protocolWith({
          ...base,
          nominationPrompts: [
            { id: 'heart', text: localized('Who?'), attribute },
          ],
        }),
      });
    const accepted = withNomination('hd');
    expect(accepted.success ? null : accepted.error.issues).toBeNull();
    expect(withNomination('name').success).toBe(false);
    // Nor can it be the attribute marking the participant.
    expect(withNomination('isEgo').success).toBe(false);
    // Nor one the person type does not have.
    expect(withNomination('missing').success).toBe(false);
  });

  it('requires each additional person field to name an attribute with a component', () => {
    const withField = (variable: string) =>
      ProtocolSchemaV9.safeParse(
        protocolWith({
          ...base,
          form: { fields: [{ variable, prompt: localized('Tell us') }] },
        }),
      );
    // `hd` is a boolean with no input control.
    const refused = withField('hd');
    expect(refused.success).toBe(false);
    expect(
      refused.success
        ? []
        : refused.error.issues.filter((issue) =>
            issue.message.includes('must define a component'),
          ),
    ).not.toEqual([]);
  });

  /** The issues a protocol earns at one path. */
  const issuesAt = (
    protocol: ReturnType<typeof protocolWith>,
    path: (string | number)[],
  ) => {
    const result = ProtocolSchemaV9.safeParse(protocol);
    return result.success
      ? []
      : result.error.issues
          .filter(
            (issue) => JSON.stringify(issue.path) === JSON.stringify(path),
          )
          .map((issue) => issue.message);
  };

  it('refuses additional person fields that collect an attribute the stage records itself', () => {
    const withField = (variable: string) =>
      issuesAt(
        protocolWith({
          ...base,
          nominationPrompts: [
            { id: 'heart', text: localized('Who?'), attribute: 'hd' },
          ],
          form: { fields: [{ variable, prompt: localized('Tell us') }] },
        }),
        ['stages', 0, 'form', 'fields', 0, 'variable'],
      );
    for (const [variable, role] of [
      ['name', 'name'],
      ['gender', 'gender identity'],
      ['sab', 'sex assigned at birth'],
      ['hd', 'nomination prompt'],
    ] as const) {
      expect(withField(variable)).toContainEqual(
        expect.stringContaining(
          `is the ${role} attribute of this Family Pedigree stage`,
        ),
      );
    }
  });

  it('refuses gender identity bound to the sex assigned at birth attribute', () => {
    expect(
      issuesAt(
        protocolWith({
          ...base,
          nodeConfiguration: {
            ...base.nodeConfiguration,
            genderIdentity: { attribute: 'sab', terms: [] },
          },
        }),
        ['stages', 0, 'nodeConfiguration', 'sexAssignedAtBirthAttribute'],
      ),
    ).toEqual([
      'Attribute "Sab" is already the gender identity attribute of this Family Pedigree stage, so it cannot also hold its sex assigned at birth answer. Each needs an attribute of its own.',
    ]);
  });

  it('refuses two nomination prompts that set the same attribute', () => {
    const protocol = protocolWith({
      ...base,
      nominationPrompts: [
        { id: 'heart', text: localized('Who?'), attribute: 'hd' },
        { id: 'again', text: localized('And who?'), attribute: 'hd' },
      ],
    });
    expect(
      issuesAt(protocol, ['stages', 0, 'nominationPrompts', 0, 'attribute']),
    ).toEqual([]);
    expect(
      issuesAt(protocol, ['stages', 0, 'nominationPrompts', 1, 'attribute']),
    ).toEqual([
      expect.stringContaining(
        'is already the attribute of another nomination prompt of this Family Pedigree stage. Each nomination prompt needs an attribute of its own.',
      ),
    ]);
  });

  describe('relationship to the participant', () => {
    const withRelationship = (
      attribute: string,
      extra: Record<string, unknown> = {},
    ) =>
      protocolWith({
        ...base,
        nodeConfiguration: {
          ...base.nodeConfiguration,
          relationshipToParticipantAttribute: attribute,
        },
        ...extra,
      });
    const relationshipPath = [
      'stages',
      0,
      'nodeConfiguration',
      'relationshipToParticipantAttribute',
    ];

    it('accepts a categorical attribute carrying exactly the fixed values, or none', () => {
      expect(ProtocolSchemaV9.safeParse(withRelationship('rel')).success).toBe(
        true,
      );
      expect(ProtocolSchemaV9.safeParse(protocolWith(base)).success).toBe(true);
    });

    it('refuses an attribute whose options are not the fixed values, or that is not categorical', () => {
      expect(
        issuesAt(withRelationship('partial'), relationshipPath),
      ).toContainEqual(
        expect.stringContaining(
          'The relationship to the participant attribute "Partial" used by',
        ),
      );
      expect(
        ProtocolSchemaV9.safeParse(withRelationship('relText')).success,
      ).toBe(false);
    });

    it('refuses an additional person field, or another of the stage’s answers, on the same attribute', () => {
      const asField = withRelationship('rel', {
        form: { fields: [{ variable: 'rel', prompt: localized('Who?') }] },
      });
      expect(
        issuesAt(asField, ['stages', 0, 'form', 'fields', 0, 'variable']),
      ).toContainEqual(
        expect.stringContaining(
          "is set by the Family Pedigree interface, which records each person's relationship to the participant",
        ),
      );
      const sharedWithSex = withRelationship('sab');
      expect(ProtocolSchemaV9.safeParse(sharedWithSex).success).toBe(false);
    });

    // Each stage works the relationships out from its own family and clears
    // them from everyone else of the type, so a second stage recording them
    // in the same attribute would clear the first stage's family.
    describe('recorded by one stage', () => {
      const { genderIdentity: _omitted, ...withoutGender } =
        base.nodeConfiguration;
      const stageRecording = (
        id: string,
        label: string,
        attribute: string,
      ) => ({
        ...base,
        id,
        label: localized(label),
        nodeConfiguration: {
          ...withoutGender,
          ...(id === 'fp1'
            ? { genderIdentity: base.nodeConfiguration.genderIdentity }
            : {}),
          relationshipToParticipantAttribute: attribute,
        },
      });
      const twoStages = (second: string) => ({
        ...protocolWith(base),
        stages: [
          stageRecording('fp1', 'Family Pedigree', 'rel'),
          stageRecording('fp2', 'Family again', second),
        ],
      });
      const at = (protocol: ReturnType<typeof twoStages>, stageIndex: number) =>
        issuesAt(protocol, [
          'stages',
          stageIndex,
          'nodeConfiguration',
          'relationshipToParticipantAttribute',
        ]);

      it('refuses two Family Pedigree stages recording relationships in one attribute, each naming the other', () => {
        const protocol = twoStages('rel');
        const reason =
          "each works out every person's relationship to the participant from its own family, and clears it from anyone outside that family";
        expect(at(protocol, 1)).toEqual([
          `The stage "Family Pedigree" also uses attribute "Relationship" here, but only one stage may, because ${reason}. Choose another attribute.`,
        ]);
        expect(at(protocol, 0)).toEqual([
          `The stage "Family again" also uses attribute "Relationship" here, but only one stage may, because ${reason}. Choose another attribute.`,
        ]);
      });
    });
  });

  describe('gender identity options managed by one stage', () => {
    const second = {
      ...base,
      id: 'fp2',
      label: localized('Family again'),
    };
    const twoStages = (secondStage: Record<string, unknown>) => ({
      ...protocolWith(base),
      stages: [base, secondStage],
    });

    it('refuses two Family Pedigree stages that manage the same attribute’s options, each naming the other', () => {
      const at = (stageIndex: number) =>
        issuesAt(twoStages(second), [
          'stages',
          stageIndex,
          'nodeConfiguration',
          'genderIdentity',
          'attribute',
        ]);
      expect(at(1)).toEqual([
        'The stage "Family Pedigree" also uses attribute "Gender" here, but only one stage may, because each decides the kinship words each of its options takes. Choose another attribute.',
      ]);
      expect(at(0)).toEqual([
        'The stage "Family again" also uses attribute "Gender" here, but only one stage may, because each decides the kinship words each of its options takes. Choose another attribute.',
      ]);
    });

    it('accepts two Family Pedigree stages when only one asks about gender identity', () => {
      const { genderIdentity: _omitted, ...nodeConfiguration } =
        base.nodeConfiguration;
      const result = ProtocolSchemaV9.safeParse(
        twoStages({ ...second, nodeConfiguration }),
      );
      expect(result.success ? null : result.error.issues).toBeNull();
    });
  });

  it('detects the participant marker being reused as a form field', () => {
    const stage = {
      ...base,
      form: {
        fields: [
          { variable: 'isEgo', prompt: localized('Are you the participant?') },
        ],
      },
    };
    const protocol = protocolWith(stage);
    const conflicts = findExclusiveVariableConflicts(protocol);
    expect(conflicts.map((conflict) => conflict.path)).toEqual([
      ['stages', 0, 'form', 'fields', 0, 'variable'],
    ]);
    expect(ProtocolSchemaV9.safeParse(protocol).success).toBe(false);
  });
});
