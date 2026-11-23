import { describe, expect, it } from 'vitest';

import { withFinishStage } from '../../../../__tests__/finishStage.ts';
import { parseIssues } from '../../../../__tests__/schemaIssues.ts';
import { familyPedigreeWordingIn } from '../../../../__tests__/suppliedWording.ts';
import { testId, testVariableId } from '../../../../__tests__/testIds.ts';
import { findExclusiveVariableConflicts } from '../../../../utils/findExclusiveVariableConflicts.ts';
import { localized, localizedOptions } from '../../../../utils/test-utils.ts';
import {
  pedigreeCompletenessText,
  pedigreeNameField,
} from '../../__tests__/family-pedigree-text.ts';
import {
  GENDER_IDENTITY_OPTIONS,
  GENDER_IDENTITY_TERMS,
} from '../../__tests__/pedigreeGenderFixtures.ts';
import {
  PEDIGREE_RELATIONSHIP_KIND_OPTIONS,
  PEDIGREE_RELATIONSHIPS_TO_PARTICIPANT,
  PEDIGREE_SEX_ASSIGNED_AT_BIRTH_OPTIONS,
} from '../../family-pedigree-values.ts';
import { ProtocolSchemaV9 } from '../../schema.ts';
import {
  FAMILY_PEDIGREE_BUILD_PROMPT_ID,
  familyPedigreeStage,
} from '../family-pedigree.ts';

const base = {
  id: testId('fp1'),
  label: localized('Family Pedigree'),
  type: 'FamilyPedigree' as const,
  wording: familyPedigreeWordingIn(),
  subject: { entity: 'node' as const, type: 'person' },
  prompt: localized('Draw your family'),
  nodeConfiguration: {
    nameAttribute: 'name',
    nameField: pedigreeNameField(),
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
        color: 'node-color-seq-1',
        shape: { default: 'circle' as const },
        variables: {
          name: {
            name: 'Name',
            type: 'text' as const,
            component: 'Text',
          },
          isEgo: {
            name: 'IsEgo',
            type: 'boolean' as const,
            component: 'Toggle',
          },
          hd: {
            name: 'HeartDisease',
            type: 'boolean' as const,
          },
          gender: {
            name: 'Gender',
            type: 'categorical' as const,
            options: genderOptions,
          },
          sab: {
            name: 'Sab',
            type: 'categorical' as const,
            options: localizedOptions(PEDIGREE_SEX_ASSIGNED_AT_BIRTH_OPTIONS),
          },
          rel: {
            name: 'Relationship',
            type: 'categorical' as const,
            options: PEDIGREE_RELATIONSHIPS_TO_PARTICIPANT.map((value) => ({
              value,
              label: localized(value),
            })),
          },
          relText: {
            name: 'RelationshipText',
            type: 'text' as const,
          },
          partial: {
            name: 'Partial',
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
        color: 'edge-color-seq-1',
        variables: {
          kind: {
            name: 'Kind',
            type: 'categorical' as const,
            options: localizedOptions(PEDIGREE_RELATIONSHIP_KIND_OPTIONS),
          },
          carrier: {
            name: 'Carrier',
            type: 'boolean' as const,
          },
          current: {
            name: 'Current',
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
      parseIssues(
        familyPedigreeStage.safeParse({ ...base, framing: 'neutral' }),
      ),
    ).toEqual([{ path: 'framing', code: 'invalid_value' }]);
  });

  it('accepts researcher-defined person fields', () => {
    expect(
      familyPedigreeStage.safeParse({
        ...base,
        form: {
          fields: [
            {
              id: testId('field-1'),
              variable: 'age',
              prompt: localized('How old are they?'),
            },
          ],
        },
      }).success,
    ).toBe(true);
  });

  it('requires nodeConfiguration', () => {
    const { nodeConfiguration: _omitted, ...withoutNodeConfiguration } = base;
    expect(
      parseIssues(familyPedigreeStage.safeParse(withoutNodeConfiguration)),
    ).toEqual([{ path: 'nodeConfiguration', code: 'invalid_type' }]);
  });

  it('requires every person attribute', () => {
    const { egoAttribute: _omitted, ...incomplete } = base.nodeConfiguration;
    expect(
      parseIssues(
        familyPedigreeStage.safeParse({
          ...base,
          nodeConfiguration: incomplete,
        }),
      ),
    ).toEqual([
      { path: 'nodeConfiguration.egoAttribute', code: 'invalid_type' },
    ]);
  });

  it('asks the name with a question of its own, and an optional hint', () => {
    const { nameField: _omitted, ...withoutNameField } = base.nodeConfiguration;
    expect(
      familyPedigreeStage.safeParse({
        ...base,
        nodeConfiguration: withoutNameField,
      }).success,
    ).toBe(true);
    expect(
      familyPedigreeStage.safeParse({
        ...base,
        nodeConfiguration: { ...base.nodeConfiguration, nameField: {} },
      }).success,
    ).toBe(true);
    const { hint: _hint, ...promptOnly } = pedigreeNameField();
    expect(
      familyPedigreeStage.safeParse({
        ...base,
        nodeConfiguration: { ...base.nodeConfiguration, nameField: promptOnly },
      }).success,
    ).toBe(true);
  });

  describe('the words shown only in some configurations', () => {
    const without = (...keys: string[]) => {
      const wording: Record<string, unknown> = familyPedigreeWordingIn();
      for (const key of keys) delete wording[key];
      return { ...base, wording };
    };
    it('holds no framing words, which every Family Pedigree shares', () => {
      expect(
        parseIssues(
          familyPedigreeStage.safeParse({
            ...base,
            framing: 'participantPreference',
            wording: {
              ...familyPedigreeWordingIn(),
              framingChoiceTitle: { en: 'How should we describe your family?' },
            },
          }),
        ),
      ).toEqual([
        {
          path: 'wording',
          code: 'unrecognized_keys',
          keys: ['framingChoiceTitle'],
        },
      ]);
    });

    it('accepts a stage that asks about gender identity without its question, which the interview words itself', () => {
      expect(
        familyPedigreeStage.safeParse(without('genderIdentityLabel')).success,
      ).toBe(true);
      const nodeConfiguration: Record<string, unknown> = {
        ...base.nodeConfiguration,
      };
      delete nodeConfiguration.genderIdentity;
      expect(
        familyPedigreeStage.safeParse({
          ...without('genderIdentityLabel'),
          nodeConfiguration,
        }).success,
      ).toBe(true);
    });
  });

  describe('the tracker’s wording', () => {
    const withCompleteness = (completeness: Record<string, unknown>) => ({
      ...base,
      completeness: {
        scope: 'parents',
        enforcement: 'required',
        relativesNotRecordedAttribute: 'notRecorded',
        ...completeness,
      },
    });
    const withParentsItem = (message: string) => {
      const text = pedigreeCompletenessText();
      return withCompleteness({
        ...text,
        itemText: { ...text.itemText, parents: { listItem: { en: message } } },
      });
    };

    it('may be left to the interview wherever the family must be complete', () => {
      expect(
        familyPedigreeStage.safeParse(
          withCompleteness(pedigreeCompletenessText()),
        ).success,
      ).toBe(true);
      expect(familyPedigreeStage.safeParse(withCompleteness({})).success).toBe(
        true,
      );
    });

    it('may say who the person is', () => {
      expect(
        familyPedigreeStage.safeParse(
          withParentsItem(
            '{isYou, select, true {Add your biological parents} other {Add biological parents for {name}}}',
          ),
        ).success,
      ).toBe(true);
    });

    it('is not told how many parents are missing', () => {
      expect(
        parseIssues(
          familyPedigreeStage.safeParse(
            withParentsItem(
              '{missing, plural, one {Add a parent for {name}} other {Add parents for {name}}}',
            ),
          ),
        ),
      ).toEqual([
        {
          path: 'completeness.itemText.parents.listItem.en',
          code: 'custom',
          message:
            '"missing" cannot choose between versions of this text by number. This text can only use "isYou", "name".',
        },
      ]);
    });

    it('may be one phrase for everyone, naming the person', () => {
      expect(
        familyPedigreeStage.safeParse(
          withParentsItem('Add biological parents for {name}'),
        ).success,
      ).toBe(true);
    });

    // The supplied wording names everyone but the participant, so a
    // translation must too.
    it('must name someone other than the participant', () => {
      const result = familyPedigreeStage.safeParse(
        withParentsItem(
          '{isYou, select, true {Add your biological parents} other {Add biological parents}}',
        ),
      );
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe(
        'This text must include the attribute "{name}" in the "isYou: other" scenario.',
      );
    });

    it('must name them in every translation, not only the default language', () => {
      const text = pedigreeCompletenessText();
      const result = familyPedigreeStage.safeParse(
        withCompleteness({
          ...text,
          itemText: {
            ...text.itemText,
            parents: {
              listItem: {
                en: '{isYou, select, true {Add your biological parents} other {Add biological parents for {name}}}',
                es: '{isYou, select, true {Añade a tus padres biológicos} other {Añade a los padres biológicos}}',
              },
            },
          },
        }),
      );
      expect(result.success).toBe(false);
      expect(result.error?.issues).toHaveLength(1);
      expect(result.error?.issues[0]?.path.at(-1)).toBe('es');
      expect(result.error?.issues[0]?.message).toBe(
        'This text must include the attribute "{name}" in the "isYou: other" scenario.',
      );
    });

    it('may not use anything else', () => {
      expect(
        parseIssues(
          familyPedigreeStage.safeParse(
            withParentsItem('Add parents for {relative}'),
          ),
        ),
      ).toEqual([
        {
          path: 'completeness.itemText.parents.listItem.en',
          code: 'custom',
          message:
            '"{relative}" is not something this text can show. This text can only use "isYou", "name".',
        },
      ]);
      // No entry is told how many are missing.
      const text = pedigreeCompletenessText();
      expect(
        parseIssues(
          familyPedigreeStage.safeParse(
            withCompleteness({
              ...text,
              itemText: {
                ...text.itemText,
                details: {
                  listItem: {
                    en: '{missing, plural, other {# details missing}}',
                  },
                },
              },
            }),
          ),
        ),
      ).toEqual([
        {
          path: 'completeness.itemText.details.listItem.en',
          code: 'custom',
          message:
            '"missing" cannot choose between versions of this text by number. This text can only use "isYou", "name".',
        },
      ]);
    });
  });

  it('requires a relationship configuration', () => {
    const { edgeConfiguration: _omitted, ...withoutRelationship } = base;
    expect(
      parseIssues(familyPedigreeStage.safeParse(withoutRelationship)),
    ).toEqual([{ path: 'edgeConfiguration', code: 'invalid_type' }]);
  });

  it('requires a non-empty prompt in every language given', () => {
    expect(
      parseIssues(
        familyPedigreeStage.safeParse({ ...base, prompt: localized('') }),
      ),
    ).toEqual([{ path: 'prompt.en', code: 'too_small' }]);
    expect(
      parseIssues(
        familyPedigreeStage.safeParse({ ...base, prompt: 'Draw your family' }),
      ),
    ).toEqual([{ path: 'prompt', code: 'invalid_type' }]);
  });

  it('accepts nomination prompts, optionally limited by sex at birth', () => {
    expect(
      familyPedigreeStage.safeParse({
        ...base,
        nominationPrompts: [
          {
            id: testId('heart'),
            text: localized('Who has had heart disease?'),
            attribute: 'hd',
          },
          {
            id: testId('ovarian'),
            text: localized('Who has had ovarian cancer?'),
            attribute: 'oc',
            onlyForSexAssignedAtBirth: 'female',
          },
        ],
      }).success,
    ).toBe(true);
  });

  it('rejects nomination prompts that reuse an id, or the family prompt id', () => {
    const prompt = {
      id: testId('heart'),
      text: localized('Who?'),
      attribute: 'hd',
    };
    const duplicate = (other: string) =>
      `The id "${testId('heart')}" is also used in this stage at ${other}. Every id in a protocol must be unique.`;
    expect(
      parseIssues(
        familyPedigreeStage.safeParse({
          ...base,
          nominationPrompts: [prompt, { ...prompt, attribute: 'other' }],
        }),
      ),
    ).toEqual([
      {
        path: 'nominationPrompts.0.id',
        code: 'custom',
        message: duplicate('nominationPrompts.1.id'),
      },
      {
        path: 'nominationPrompts.1.id',
        code: 'custom',
        message: duplicate('nominationPrompts.0.id'),
      },
    ]);
    expect(
      parseIssues(
        familyPedigreeStage.safeParse({
          ...base,
          nominationPrompts: [
            { ...prompt, id: FAMILY_PEDIGREE_BUILD_PROMPT_ID },
          ],
        }),
      ),
    ).toEqual([{ path: 'nominationPrompts.0.id', code: 'invalid_format' }]);
  });

  it('rejects an empty list of nomination prompts, or another limit', () => {
    expect(
      parseIssues(
        familyPedigreeStage.safeParse({ ...base, nominationPrompts: [] }),
      ),
    ).toEqual([{ path: 'nominationPrompts', code: 'too_small' }]);
    expect(
      parseIssues(
        familyPedigreeStage.safeParse({
          ...base,
          nominationPrompts: [
            {
              id: testId('heart'),
              text: localized('Who?'),
              attribute: 'hd',
              onlyForSexAssignedAtBirth: 'intersex',
            },
          ],
        }),
      ),
    ).toEqual([
      {
        path: 'nominationPrompts.0.onlyForSexAssignedAtBirth',
        code: 'invalid_value',
      },
    ]);
  });

  it('rejects the keys of the retired census interface', () => {
    expect(
      parseIssues(
        familyPedigreeStage.safeParse({
          ...base,
          censusPrompt: localized('Build'),
        }),
      ),
    ).toEqual([
      { path: '', code: 'unrecognized_keys', keys: ['censusPrompt'] },
    ]);
  });
});

describe('FamilyPedigree in a whole protocol', () => {
  it('accepts a stage bound to correctly shaped codebook variables', () => {
    const result = ProtocolSchemaV9.safeParse(
      withFinishStage(protocolWith(base)),
    );
    expect(result.success ? null : result.error.issues).toBeNull();
  });

  it('accepts gender identity words for an option the attribute no longer has', () => {
    const result = ProtocolSchemaV9.safeParse(
      withFinishStage(
        protocolWith(
          base,
          localizedOptions([
            { value: 'woman', label: 'Woman' },
            { value: 'man', label: 'Man' },
          ]),
        ),
      ),
    );
    expect(result.success ? null : result.error.issues).toBeNull();
  });

  it('accepts a stage that does not ask about gender identity', () => {
    const { genderIdentity: _omitted, ...nodeConfiguration } =
      base.nodeConfiguration;
    const result = ProtocolSchemaV9.safeParse(
      withFinishStage(protocolWith({ ...base, nodeConfiguration })),
    );
    expect(result.success ? null : result.error.issues).toBeNull();
  });

  it('refuses gender identity that names a variable but no words', () => {
    expect(
      parseIssues(
        familyPedigreeStage.safeParse({
          ...base,
          nodeConfiguration: {
            ...base.nodeConfiguration,
            genderIdentity: { attribute: 'gender' },
          },
        }),
      ),
    ).toEqual([
      { path: 'nodeConfiguration.genderIdentity.terms', code: 'invalid_type' },
    ]);
  });

  it('requires each nomination prompt attribute to be a boolean', () => {
    const withNomination = (attribute: string) =>
      ProtocolSchemaV9.safeParse(
        withFinishStage({
          ...protocolWith({
            ...base,
            nominationPrompts: [
              { id: testId('heart'), text: localized('Who?'), attribute },
            ],
          }),
        }),
      );
    const accepted = withNomination('hd');
    expect(accepted.success ? null : accepted.error.issues).toBeNull();
    expect(parseIssues(withNomination('relText'))).toEqual([
      {
        path: 'stages.0.nominationPrompts.0.attribute',
        code: 'custom',
        message: `The attribute "${testVariableId('relText')}" must be of type boolean`,
      },
    ]);
    // Nor can it be the attribute marking the participant.
    expect(parseIssues(withNomination('isEgo'))).toEqual([
      {
        path: 'stages.0.nominationPrompts.0.attribute',
        code: 'custom',
        message:
          'Attribute "IsEgo" is set by the Family Pedigree interface, which marks the participant, so nothing else in this protocol may set it.',
      },
    ]);
    // Nor one the person type does not have.
    expect(parseIssues(withNomination('missing'))).toEqual([
      {
        path: 'stages.0.nominationPrompts.0.attribute',
        code: 'custom',
        message: 'The attribute "missing" does not exist in the codebook',
      },
    ]);
  });

  it('requires each additional person field to name an attribute with a component', () => {
    const withField = (variable: string) =>
      ProtocolSchemaV9.safeParse(
        withFinishStage(
          protocolWith({
            ...base,
            form: {
              fields: [
                {
                  id: testId('field-1'),
                  variable,
                  prompt: localized('Tell us'),
                },
              ],
            },
          }),
        ),
      );
    // `hd` is a boolean with no input control.
    const refused = withField('hd');
    expect(parseIssues(refused)).toEqual([
      {
        path: 'stages.0.form.fields.0.variable',
        code: 'custom',
        message: `Form field attribute "${testVariableId('hd')}" must define a component (input control) to be rendered as a form field.`,
      },
    ]);
  });

  /** The issues a protocol earns at one path. */
  const issuesAt = (
    protocol: ReturnType<typeof protocolWith>,
    path: (string | number)[],
  ) => {
    const result = ProtocolSchemaV9.safeParse(withFinishStage(protocol));
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
            { id: testId('heart'), text: localized('Who?'), attribute: 'hd' },
          ],
          form: {
            fields: [
              { id: testId('field-1'), variable, prompt: localized('Tell us') },
            ],
          },
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
        { id: testId('heart'), text: localized('Who?'), attribute: 'hd' },
        { id: testId('again'), text: localized('And who?'), attribute: 'hd' },
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
      expect(
        ProtocolSchemaV9.safeParse(withFinishStage(withRelationship('rel')))
          .success,
      ).toBe(true);
      expect(
        ProtocolSchemaV9.safeParse(withFinishStage(protocolWith(base))).success,
      ).toBe(true);
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
        parseIssues(
          ProtocolSchemaV9.safeParse(
            withFinishStage(withRelationship('relText')),
          ),
        ),
      ).toEqual([
        {
          path: 'stages.0.nodeConfiguration.relationshipToParticipantAttribute',
          code: 'custom',
          message: `The attribute "${testVariableId('relText')}" must be of type categorical`,
        },
      ]);
    });

    it('refuses an additional person field, or another of the stage’s answers, on the same attribute', () => {
      const asField = withRelationship('rel', {
        form: {
          fields: [
            {
              id: testId('field-1'),
              variable: 'rel',
              prompt: localized('Who?'),
            },
          ],
        },
      });
      expect(
        issuesAt(asField, ['stages', 0, 'form', 'fields', 0, 'variable']),
      ).toContainEqual(
        expect.stringContaining(
          "is set by the Family Pedigree interface, which records each person's relationship to the participant",
        ),
      );
      const sharedWithSex = withRelationship('sab');
      expect(
        parseIssues(ProtocolSchemaV9.safeParse(withFinishStage(sharedWithSex))),
      ).toEqual([
        {
          path: 'stages.0.nodeConfiguration.relationshipToParticipantAttribute',
          code: 'custom',
          message:
            'The relationship to the participant attribute "Sab" used by a Family Pedigree stage must keep its fixed options.',
        },
        {
          path: 'stages.0.nodeConfiguration.sexAssignedAtBirthAttribute',
          code: 'custom',
          message:
            'Attribute "Sab" is set by the Family Pedigree interface, which records each person\'s relationship to the participant, so nothing else in this protocol may set it.',
        },
      ]);
    });
  });

  describe('gender identity options managed by one stage', () => {
    const second = {
      ...base,
      id: testId('fp2'),
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
        'The options of attribute "Gender" are also managed by the stage "Family Pedigree", but only one stage may manage them, because each decides the kinship words each option takes. Choose another attribute.',
      ]);
      expect(at(0)).toEqual([
        'The options of attribute "Gender" are also managed by the stage "Family again", but only one stage may manage them, because each decides the kinship words each option takes. Choose another attribute.',
      ]);
    });

    it('accepts two Family Pedigree stages when only one asks about gender identity', () => {
      const { genderIdentity: _omitted, ...nodeConfiguration } =
        base.nodeConfiguration;
      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(twoStages({ ...second, nodeConfiguration })),
      );
      expect(result.success ? null : result.error.issues).toBeNull();
    });
  });

  it('detects the participant marker being reused as a form field', () => {
    const stage = {
      ...base,
      form: {
        fields: [
          {
            id: testId('field-1'),
            variable: 'isEgo',
            prompt: localized('Are you the participant?'),
          },
        ],
      },
    };
    const protocol = protocolWith(stage);
    const conflicts = findExclusiveVariableConflicts(protocol);
    expect(conflicts.map((conflict) => conflict.path)).toEqual([
      ['stages', 0, 'form', 'fields', 0, 'variable'],
    ]);
    expect(
      parseIssues(ProtocolSchemaV9.safeParse(withFinishStage(protocol))),
    ).toEqual([
      {
        path: 'stages.0.form.fields.0.variable',
        code: 'custom',
        message:
          'Attribute "IsEgo" is set by the Family Pedigree interface, which marks the participant, so nothing else in this protocol may set it.',
      },
    ]);
  });
});
