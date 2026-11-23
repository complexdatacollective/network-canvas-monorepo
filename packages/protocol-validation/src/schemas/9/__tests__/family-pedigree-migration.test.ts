import { describe, expect, it } from 'vitest';

import { testId } from '../../../__tests__/testIds.ts';
import {
  escapeMessageText,
  messageText,
} from '../../../localization/messageSyntax.ts';
import { MigrationResultInvalidError } from '../../../migration/errors.ts';
import { migrateProtocol } from '../../../migration/migrate-protocol.ts';
import ProtocolSchemaV8 from '../../8/schema.ts';
import {
  PEDIGREE_RELATIONSHIP_KIND_OPTIONS,
  PEDIGREE_RELATIVES_NOT_RECORDED_OPTIONS,
  PEDIGREE_SEX_ASSIGNED_AT_BIRTH_OPTIONS,
} from '../family-pedigree-values.ts';
import migrationV8toV9 from '../migration.ts';
import { isProtocolObjectId } from '../protocol-object-id.ts';
// The CEGRM template as `main` released it (commit 5dec6ca2), when the Family
// Pedigree was a schema 8 stage.
import ecoGeneticTemplate from './fixtures/eco-genetic-relationship-maps.schema-8.json';
import { migratedStageId } from './migrated-stage-ids.ts';

type Fields = Record<string, unknown>;

const isRecord = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const en = (text: string) => ({ en: escapeMessageText(text) });

const localizedOptions = (
  options: readonly { value: string; label: string }[],
) => options.map(({ value, label }) => ({ value, label: en(label) }));

// The value sets as schema 8 locked them, labels included.
const SCHEMA_8_BIOLOGICAL_SEX_OPTIONS = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  {
    value: 'intersex',
    label: 'Intersex or a variation in sex characteristics',
  },
  { value: 'unknown', label: 'Don’t know' },
  { value: 'preferNotToSay', label: 'Prefer not to say' },
];

const SCHEMA_8_RELATIONSHIP_TYPE_OPTIONS = [
  { value: 'biological', label: 'Biological' },
  { value: 'social', label: 'Social' },
  { value: 'donor', label: 'Donor' },
  { value: 'surrogate', label: 'Surrogate' },
  { value: 'adoptive', label: 'Adoptive' },
  { value: 'partner', label: 'Partner' },
];

const SCHEMA_8_GAMETE_ROLE_OPTIONS = [
  { value: 'egg', label: 'Egg' },
  { value: 'sperm', label: 'Sperm' },
];

const information = (id: string, extra: Fields = {}): Fields => ({
  id,
  type: 'Information',
  label: id,
  title: id,
  items: [{ id: `${id}-text`, type: 'text', content: `The ${id} screen.` }],
  ...extra,
});

const consentSkip = (destination?: Fields): Fields => ({
  action: 'SKIP',
  filter: {
    rules: [
      {
        id: 'consent-rule',
        type: 'ego',
        options: { attribute: 'consent', operator: 'EXACTLY', value: false },
      },
    ],
  },
  ...(destination && { destination }),
});

/** A schema 8 Family Pedigree with every optional piece set. */
const schema8Pedigree = (extra: Fields = {}): Fields => ({
  id: 'pedigree',
  type: 'FamilyPedigree',
  label: 'Your family',
  interviewScript: 'Draw the family with the participant.',
  nodeConfig: {
    type: 'person',
    nodeLabelVariable: 'name',
    egoVariable: 'isEgo',
    relationshipVariable: 'relationshipToEgo',
    biologicalSexVariable: 'biologicalSex',
    form: [
      { id: 'field-age', variable: 'age', prompt: 'How old is {name}?' },
      {
        variable: 'living',
        prompt: 'Is this person living?',
        hint: 'Say if you do not know.',
      },
    ],
  },
  edgeConfig: {
    type: 'family',
    relationshipTypeVariable: 'relationshipType',
    isActiveVariable: 'isActive',
    isGestationalCarrierVariable: 'isGestationalCarrier',
    gameteRoleVariable: 'gameteRole',
  },
  framing: { mode: 'fixed', value: 'gendered' },
  boundaries: {
    requireGrandparents: 'required',
    requireChildrenContributors: 'recommended',
  },
  introScreen: {
    items: [
      {
        id: 'intro-text',
        type: 'text',
        content: 'We will draw your *family*.',
      },
      {
        id: 'intro-image',
        type: 'asset',
        content: 'family-image',
        description: 'A drawn family tree',
      },
    ],
  },
  censusPrompt: 'Who is in your family? {braces} it’s fine',
  nominationPrompts: [
    {
      id: 'nominate-condition',
      text: 'Who has had **the condition**?',
      variable: 'hasCondition',
    },
  ],
  ...extra,
});

const personVariables = (): Fields => ({
  name: { name: 'name', type: 'text' },
  isEgo: { name: 'isEgo', type: 'boolean' },
  relationshipToEgo: { name: 'relationshipToEgo', type: 'text' },
  biologicalSex: {
    name: 'biologicalSex',
    type: 'categorical',
    options: structuredClone(SCHEMA_8_BIOLOGICAL_SEX_OPTIONS),
  },
  age: { name: 'age', type: 'number', component: 'Number' },
  living: { name: 'living', type: 'boolean', component: 'Toggle' },
  hasCondition: { name: 'hasCondition', type: 'boolean' },
  hadTesting: { name: 'hadTesting', type: 'boolean' },
});

/**
 * A schema 8 protocol holding `stages`, by default a welcome screen, the
 * pedigree and a closing screen.
 */
const schema8Protocol = (
  stages: Fields[] = [
    information('welcome'),
    schema8Pedigree(),
    information('goodbye'),
  ],
): Fields => ({
  schemaVersion: 8,
  name: 'Pedigree study',
  codebook: {
    ego: { variables: { consent: { name: 'consent', type: 'boolean' } } },
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        shape: { default: 'circle' },
        variables: personVariables(),
      },
    },
    edge: {
      family: {
        name: 'Family',
        color: 'edge-color-seq-1',
        variables: {
          relationshipType: {
            name: 'relationshipType',
            type: 'categorical',
            options: structuredClone(SCHEMA_8_RELATIONSHIP_TYPE_OPTIONS),
          },
          isActive: { name: 'isActive', type: 'boolean' },
          isGestationalCarrier: {
            name: 'isGestationalCarrier',
            type: 'boolean',
          },
          gameteRole: {
            name: 'gameteRole',
            type: 'categorical',
            options: structuredClone(SCHEMA_8_GAMETE_ROLE_OPTIONS),
          },
        },
      },
    },
  },
  assetManifest: {
    'family-image': {
      id: 'family-image',
      type: 'image',
      name: 'family.png',
      source: 'family.png',
    },
  },
  stages,
});

/** Runs the v8 to v9 step alone, without validating its result. */
const migrateStep = (document: Fields): Fields =>
  migrationV8toV9.migrate(ProtocolSchemaV8.parse(document), {});

/** Runs the whole chain, which validates the result against schema 9. */
const migrateValid = (document: Fields): Fields =>
  migrateProtocol(document, 9) as unknown as Fields;

const asRecord = (value: unknown): Fields => (isRecord(value) ? value : {});

const stagesOf = (document: Fields): Fields[] =>
  Array.isArray(document.stages) ? document.stages.filter(isRecord) : [];

const stageById = (document: Fields, id: string | undefined): Fields => {
  const stage = stagesOf(document).find((candidate) => candidate.id === id);
  if (!stage) throw new Error(`No stage "${id}"`);
  return stage;
};

const pedigreeOf = (document: Fields): Fields => {
  const stage = stagesOf(document).find(
    (candidate) => candidate.type === 'FamilyPedigree',
  );
  if (!stage) throw new Error('No Family Pedigree stage');
  return stage;
};

const variableAt = (
  document: Fields,
  entity: 'node' | 'edge',
  type: string,
  variable: string,
): Fields | undefined => {
  const codebook = isRecord(document.codebook) ? document.codebook : {};
  const types = isRecord(codebook[entity]) ? codebook[entity] : {};
  const definition = isRecord(types[type]) ? types[type] : {};
  const variables = isRecord(definition.variables) ? definition.variables : {};
  const found = variables[variable];
  return isRecord(found) ? found : undefined;
};

const stageIds = (document: Fields) =>
  stagesOf(document).map((stage) => stage.id);

const stageTypes = (document: Fields) =>
  stagesOf(document).map((stage) => stage.type);

/** The stage the migration adds just before the pedigree. */
const introductionOf = (document: Fields): Fields => {
  const stages = stagesOf(document);
  const stage =
    stages[
      stages.findIndex((candidate) => candidate.type === 'FamilyPedigree') - 1
    ];
  if (stage?.type !== 'Information') throw new Error('No introduction stage');
  return stage;
};

// The migration replaces every id that is not a UUID, so a readable schema 8
// id does not survive it.
const withoutIds = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(withoutIds)
    : isRecord(value)
      ? Object.fromEntries(
          Object.entries(value)
            .filter(([key]) => key !== 'id')
            .map(([key, child]) => [key, withoutIds(child)]),
        )
      : value;

describe('v8 to v9 Family Pedigree migration', () => {
  it('converts a full schema 8 pedigree into a stage schema 9 accepts', () => {
    const document = schema8Protocol();
    const migrated = migrateValid(document);

    expect(pedigreeOf(migrated).id).toBe(
      migratedStageId(document, migrated, 'pedigree'),
    );
    expect(withoutIds(pedigreeOf(migrated))).toEqual({
      type: 'FamilyPedigree',
      label: en('Your family'),
      interviewScript: 'Draw the family with the participant.',
      subject: { entity: 'node', type: 'person' },
      prompt: en('Who is in your family? {braces} it’s fine'),
      nodeConfiguration: {
        nameAttribute: 'name',
        sexAssignedAtBirthAttribute: 'biologicalSex',
        egoAttribute: 'isEgo',
      },
      edgeConfiguration: {
        type: 'family',
        kindAttribute: 'relationshipType',
        gestationalCarrierAttribute: 'isGestationalCarrier',
        currentPartnerAttribute: 'isActive',
      },
      framing: 'gendered',
      completeness: {
        scope: 'grandparents',
        enforcement: 'required',
        relativesNotRecordedAttribute: 'relativesNotRecorded',
      },
      form: {
        fields: [
          {
            variable: 'age',
            prompt: en('How old is {name}?'),
          },
          {
            variable: 'living',
            prompt: en('Is this person living?'),
            hint: en('Say if you do not know.'),
          },
        ],
      },
      nominationPrompts: [
        {
          text: en('Who has had **the condition**?'),
          attribute: 'hasCondition',
        },
      ],
    });
  });

  it('escapes the census prompt so it reads as written', () => {
    const { prompt } = pedigreeOf(migrateStep(schema8Protocol()));
    if (!isRecord(prompt) || typeof prompt.en !== 'string') {
      throw new Error('The prompt is not localized');
    }
    expect(prompt.en).not.toBe('Who is in your family? {braces} it’s fine');
    expect(messageText(prompt.en)).toBe(
      'Who is in your family? {braces} it’s fine',
    );
  });

  it('does not change the document it is given', () => {
    const document = schema8Protocol();
    const before = structuredClone(document);
    migrateStep(document);
    expect(document).toEqual(before);
  });

  describe('framing', () => {
    it.for([
      [{ mode: 'fixed', value: 'gendered' }, 'gendered'],
      [{ mode: 'fixed', value: 'gamete' }, 'gamete'],
      [{ mode: 'participantChoice' }, 'participantPreference'],
    ] as const)('converts %o to %s', ([framing, expected]) => {
      const migrated = migrateValid(
        schema8Protocol([schema8Pedigree({ framing })]),
      );
      expect(pedigreeOf(migrated).framing).toBe(expected);
    });

    it('leaves out a framing schema 8 did not have, so it defaults to gendered', () => {
      const pedigree = schema8Pedigree();
      delete pedigree.framing;
      const migrated = migrateValid(schema8Protocol([pedigree]));
      expect(pedigreeOf(migrated)).not.toHaveProperty('framing');
    });

    it('passes a framing schema 8 rejected through for validation to report', () => {
      const framing = { mode: 'fixed', value: 'cousins' };
      expect(
        pedigreeOf(migrateStep(schema8Protocol([schema8Pedigree({ framing })])))
          .framing,
      ).toBe('cousins');
      expect(() =>
        migrateValid(schema8Protocol([schema8Pedigree({ framing })])),
      ).toThrow(MigrationResultInvalidError);
    });
  });

  describe('boundaries', () => {
    const settings = ['required', 'recommended', 'off'] as const;
    const combinations = settings.flatMap((requireGrandparents) =>
      settings.map(
        (requireChildrenContributors) =>
          [requireGrandparents, requireChildrenContributors] as const,
      ),
    );

    it.for(combinations)(
      'grandparents %s and children contributors %s',
      ([requireGrandparents, requireChildrenContributors]) => {
        const migrated = migrateValid(
          schema8Protocol([
            schema8Pedigree({
              boundaries: { requireGrandparents, requireChildrenContributors },
            }),
          ]),
        );
        const pedigree = pedigreeOf(migrated);
        const relativesNotRecorded = variableAt(
          migrated,
          'node',
          'person',
          'relativesNotRecorded',
        );

        // Schema 8 always required two parents; its grandparents boundary
        // added their parents. Children contributors have no counterpart.
        expect(pedigree.completeness).toEqual(
          requireGrandparents === 'off'
            ? {
                scope: 'parents',
                enforcement: 'required',
                relativesNotRecordedAttribute: 'relativesNotRecorded',
              }
            : {
                scope: 'grandparents',
                enforcement: requireGrandparents,
                relativesNotRecordedAttribute: 'relativesNotRecorded',
              },
        );
        expect(relativesNotRecorded).toEqual({
          name: 'relativesNotRecorded',
          type: 'categorical',
          options: localizedOptions(PEDIGREE_RELATIVES_NOT_RECORDED_OPTIONS),
        });
      },
    );

    it('requires both parents when schema 8 had no boundaries', () => {
      const pedigree = schema8Pedigree();
      delete pedigree.boundaries;
      const migrated = migrateValid(schema8Protocol([pedigree]));
      expect(pedigreeOf(migrated).completeness).toEqual({
        scope: 'parents',
        enforcement: 'required',
        relativesNotRecordedAttribute: 'relativesNotRecorded',
      });
      expect(
        variableAt(migrated, 'node', 'person', 'relativesNotRecorded'),
      ).toMatchObject({ type: 'categorical' });
    });

    it('gives the new attribute a key and a name the person type does not use', () => {
      const document = schema8Protocol();
      const codebook = document.codebook as {
        node: { person: { variables: Fields } };
      };
      codebook.node.person.variables.relativesNotRecorded = {
        name: 'notes',
        type: 'text',
      };
      codebook.node.person.variables.other = {
        name: 'RelativesNotRecorded2',
        type: 'text',
      };

      const migrated = migrateValid(document);
      expect(pedigreeOf(migrated).completeness).toMatchObject({
        relativesNotRecordedAttribute: 'relativesNotRecorded3',
      });
      expect(
        variableAt(migrated, 'node', 'person', 'relativesNotRecorded3'),
      ).toMatchObject({ name: 'relativesNotRecorded3', type: 'categorical' });
      expect(
        variableAt(migrated, 'node', 'person', 'relativesNotRecorded'),
      ).toMatchObject({ name: 'notes', type: 'text' });
    });

    it('shares one new attribute between pedigrees of the same person type', () => {
      const document = schema8Protocol([
        schema8Pedigree({ id: 'mother-side', introScreen: undefined }),
        schema8Pedigree({
          id: 'father-side',
          introScreen: undefined,
          boundaries: {
            requireGrandparents: 'recommended',
            requireChildrenContributors: 'off',
          },
        }),
      ]);
      const migrated = migrateValid(document);
      for (const id of ['mother-side', 'father-side']) {
        expect(
          stageById(migrated, migratedStageId(document, migrated, id))
            .completeness,
        ).toMatchObject({
          relativesNotRecordedAttribute: 'relativesNotRecorded',
        });
      }
      expect(
        variableAt(migrated, 'node', 'person', 'relativesNotRecorded2'),
      ).toBeUndefined();
    });
  });

  describe('introduction screen', () => {
    it('becomes an Information stage just before the pedigree', () => {
      const document = schema8Protocol();
      const migrated = migrateValid(document);

      expect(stageTypes(migrated)).toEqual([
        'Information',
        'Information',
        'FamilyPedigree',
        'Information',
        'FinishSession',
      ]);
      expect(stageIds(migrated)).toEqual([
        migratedStageId(document, migrated, 'welcome'),
        introductionOf(migrated).id,
        migratedStageId(document, migrated, 'pedigree'),
        migratedStageId(document, migrated, 'goodbye'),
        expect.any(String),
      ]);
      expect(isProtocolObjectId(introductionOf(migrated).id)).toBe(true);
      expect(withoutIds(introductionOf(migrated))).toEqual({
        type: 'Information',
        label: en('Your family (introduction)'),
        content: en(
          '# Introduction\n\nWe will draw your *family*.\n\n![A drawn family tree](asset:family-image)',
        ),
      });
      expect(pedigreeOf(migrated)).not.toHaveProperty('introScreen');
    });

    it('is skipped by the pedigree’s own skip logic', () => {
      const document = schema8Protocol([
        information('welcome'),
        schema8Pedigree({
          skipLogic: consentSkip({ type: 'stage', stageId: 'goodbye' }),
        }),
        information('goodbye'),
      ]);
      const migrated = migrateValid(document);
      const skipLogic = withoutIds(
        consentSkip({
          type: 'stage',
          stageId: migratedStageId(document, migrated, 'goodbye'),
        }),
      );
      expect(withoutIds(introductionOf(migrated).skipLogic)).toEqual(skipLogic);
      expect(withoutIds(pedigreeOf(migrated).skipLogic)).toEqual(skipLogic);
    });

    it('has no skip logic when the pedigree has none', () => {
      const migrated = migrateValid(schema8Protocol());
      expect(introductionOf(migrated)).not.toHaveProperty('skipLogic');
    });

    it('receives a skip that jumped to the pedigree', () => {
      const document = schema8Protocol([
        information('welcome', {
          skipLogic: consentSkip({ type: 'stage', stageId: 'pedigree' }),
        }),
        information('consent'),
        schema8Pedigree(),
        information('goodbye', {
          skipLogic: consentSkip({ type: 'finish' }),
        }),
      ]);
      const migrated = migrateValid(document);
      expect(
        stageById(migrated, migratedStageId(document, migrated, 'welcome'))
          .skipLogic,
      ).toMatchObject({
        destination: { type: 'stage', stageId: introductionOf(migrated).id },
      });
      expect(
        stageById(migrated, migratedStageId(document, migrated, 'goodbye'))
          .skipLogic,
      ).toMatchObject({
        destination: { type: 'finish' },
      });
    });

    it('takes an id no other stage has', () => {
      const migrated = migrateValid(
        schema8Protocol([
          information('pedigree-introduction'),
          information('pedigree-introduction-2'),
          schema8Pedigree(),
        ]),
      );
      const ids = stageIds(migrated);
      expect(stageTypes(migrated)).toEqual([
        'Information',
        'Information',
        'Information',
        'FamilyPedigree',
        'FinishSession',
      ]);
      expect(ids[2]).toBe(introductionOf(migrated).id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('leaves out text items that showed nothing', () => {
      const migrated = migrateValid(
        schema8Protocol([
          schema8Pedigree({
            introScreen: {
              items: [
                { id: 'empty', type: 'text', content: '' },
                { id: 'blank', type: 'text', content: '  \n' },
                { id: 'kept', type: 'text', content: 'Welcome.' },
              ],
            },
          }),
        ]),
      );
      expect(introductionOf(migrated).content).toEqual(
        en('# Introduction\n\nWelcome.'),
      );
    });

    it.for([
      ['no introduction screen', undefined],
      ['no items', { items: [] }],
      ['only empty text', { items: [{ id: 'e', type: 'text', content: '' }] }],
    ] as const)('adds no stage for %s', ([, introScreen]) => {
      const pedigree = schema8Pedigree();
      if (introScreen === undefined) delete pedigree.introScreen;
      else pedigree.introScreen = introScreen;
      const migrated = migrateValid(schema8Protocol([pedigree]));
      expect(stageTypes(migrated)).toEqual(['FamilyPedigree', 'FinishSession']);
    });
  });

  describe('nomination prompts', () => {
    it('renames a prompt with the reserved id "pedigree"', () => {
      const migrated = migrateValid(
        schema8Protocol([
          schema8Pedigree({
            nominationPrompts: [
              { id: 'pedigree', text: 'Who smokes?', variable: 'hasCondition' },
              {
                id: 'nomination',
                text: 'Who was tested?',
                variable: 'hadTesting',
              },
            ],
          }),
        ]),
      );
      const prompts = pedigreeOf(migrated).nominationPrompts;
      expect(withoutIds(prompts)).toEqual([
        { text: en('Who smokes?'), attribute: 'hasCondition' },
        { text: en('Who was tested?'), attribute: 'hadTesting' },
      ]);
      const ids = Array.isArray(prompts)
        ? prompts.map((prompt) => asRecord(prompt).id)
        : [];
      expect(ids.every(isProtocolObjectId)).toBe(true);
      expect(new Set(ids).size).toBe(2);
    });

    it('replaces a nomination prompt id that is already a UUID', () => {
      const migrated = migrateValid(
        schema8Protocol([
          schema8Pedigree({
            nominationPrompts: [
              { id: testId('who'), text: 'Who?', variable: 'hasCondition' },
            ],
          }),
        ]),
      );
      const { nominationPrompts } = pedigreeOf(migrated);
      const prompt = Array.isArray(nominationPrompts)
        ? nominationPrompts[0]
        : undefined;
      expect(prompt).toEqual({
        id: expect.any(String),
        text: en('Who?'),
        attribute: 'hasCondition',
      });
      expect(isProtocolObjectId(asRecord(prompt).id)).toBe(true);
      expect(asRecord(prompt).id).not.toBe(testId('who'));
    });

    it('leaves out an empty list, which schema 9 does not accept', () => {
      const migrated = migrateValid(
        schema8Protocol([schema8Pedigree({ nominationPrompts: [] })]),
      );
      expect(pedigreeOf(migrated)).not.toHaveProperty('nominationPrompts');
    });

    // Schema 8 let two prompts set one attribute: the second started with the
    // first's selections and its changes overwrote them. Schema 9 gives each
    // prompt an attribute of its own, and no conversion can tell which prompt
    // a recorded answer came from.
    it('leaves two prompts that set one attribute for validation to refuse', () => {
      const document = schema8Protocol([
        schema8Pedigree({
          nominationPrompts: [
            {
              id: 'heart',
              text: 'Who has heart disease?',
              variable: 'hasCondition',
            },
            {
              id: 'attack',
              text: 'Who had a heart attack?',
              variable: 'hasCondition',
            },
          ],
        }),
      ]);
      expect(
        (pedigreeOf(migrateStep(document)).nominationPrompts as Fields[]).map(
          (prompt) => prompt.attribute,
        ),
      ).toEqual(['hasCondition', 'hasCondition']);
      expect(() => migrateValid(document)).toThrow(MigrationResultInvalidError);
      expect(() => migrateValid(document)).toThrow(
        'Attribute \\"hasCondition\\" is already the attribute of another nomination prompt of this Family Pedigree stage. Each nomination prompt needs an attribute of its own.',
      );
    });
  });

  // Schema 8 accepted text of only spaces here, which showed no words. A
  // prompt or question is the protocol's own content, which the migration
  // never writes, so the document is refused at that place.
  describe('text that shows nothing', () => {
    // The pedigree follows the introduction stage the conversion adds.
    const refusedAt = (
      document: Fields,
      below: readonly (string | number)[],
    ) => {
      let paths: (string | number)[][] = [];
      try {
        migrateValid(document);
      } catch (error) {
        if (!(error instanceof MigrationResultInvalidError)) throw error;
        paths = error.issues.map((issue) => issue.path);
      }
      expect(paths).toContainEqual([
        'stages',
        expect.any(Number),
        ...below,
        'en',
      ]);
    };

    it.each([' ', '\t', '\u00a0', '\u200b'])(
      'refuses a prompt of %j at the prompt',
      (blank) => {
        refusedAt(schema8Protocol([schema8Pedigree({ censusPrompt: blank })]), [
          'prompt',
        ]);
      },
    );

    it.each([' ', '\t', '\u00a0', '\u200b'])(
      'refuses a question about the family of %j at the question',
      (blank) => {
        refusedAt(
          schema8Protocol([
            schema8Pedigree({
              nominationPrompts: [
                { id: 'condition', text: blank, variable: 'hasCondition' },
                {
                  id: 'tested',
                  text: 'Who was tested?',
                  variable: 'hadTesting',
                },
              ],
            }),
          ]),
          ['nominationPrompts', 0, 'text'],
        );
      },
    );

    it('refuses a blank question in its form at the question', () => {
      const pedigree = schema8Pedigree();
      (pedigree.nodeConfig as Fields).form = [
        { variable: 'living', prompt: ' ' },
      ];
      refusedAt(schema8Protocol([pedigree]), ['form', 'fields', 0, 'prompt']);
    });
  });

  // Schema 8 did not check the name attribute's type, so the name could share
  // an attribute with sex at birth or a nomination prompt, each answer
  // overwriting the other. Nothing tells the answers apart afterwards.
  it.for([
    ['sex assigned at birth', 'biologicalSex'],
    ['nomination prompt', 'hasCondition'],
  ] as const)(
    'leaves a name attribute that is also the %s attribute for validation to refuse',
    ([role, variable]) => {
      const pedigree = schema8Pedigree();
      (pedigree.nodeConfig as Fields).nodeLabelVariable = variable;
      expect(() => migrateValid(schema8Protocol([pedigree]))).toThrow(
        `is already the name attribute of this Family Pedigree stage, so it cannot also hold its ${role} answer.`,
      );
    },
  );

  describe('form', () => {
    it('leaves out an empty field list, which schema 9 does not accept', () => {
      const pedigree = schema8Pedigree();
      (pedigree.nodeConfig as Fields).form = [];
      const migrated = migrateValid(schema8Protocol([pedigree]));
      expect(pedigreeOf(migrated)).not.toHaveProperty('form');
    });

    // An empty hint showed nothing, and schema 9 refuses one.
    it('leaves out an empty hint', () => {
      const pedigree = schema8Pedigree();
      (pedigree.nodeConfig as Fields).form = [
        { variable: 'living', prompt: 'Living?', hint: '' },
      ];
      const migrated = migrateValid(schema8Protocol([pedigree]));
      expect(withoutIds(pedigreeOf(migrated).form)).toEqual({
        fields: [{ variable: 'living', prompt: en('Living?') }],
      });
    });

    /**
     * A pedigree whose form collects `variables` beside the age field, each
     * attribute given an input control so schema 8 could render it.
     */
    const pedigreeCollecting = (
      variables: string[],
      nodeConfig: Fields = {},
    ): Fields[] => {
      const pedigree = schema8Pedigree();
      pedigree.nodeConfig = {
        ...(pedigree.nodeConfig as Fields),
        ...nodeConfig,
        form: [
          { id: 'field-age', variable: 'age', prompt: 'How old?' },
          ...variables.map((variable) => ({
            variable,
            prompt: `Their ${variable}?`,
          })),
        ],
      };
      return [pedigree];
    };

    const withControls = (document: Fields): Fields => {
      const controls: Record<string, string> = {
        name: 'Text',
        fullName: 'Text',
        biologicalSex: 'ToggleButtonGroup',
        hasCondition: 'Toggle',
      };
      for (const [variable, component] of Object.entries(controls)) {
        const definition = variableAt(document, 'node', 'person', variable);
        if (definition) definition.component = component;
      }
      return document;
    };

    const AGE_FIELD = {
      variable: 'age',
      prompt: en('How old?'),
    };

    // The schema 8 interface asked the name itself and never showed a field
    // collecting the name attribute, so leaving it out changes nothing a
    // participant saw.
    it('leaves out a field collecting the name attribute, which schema 8 never showed', () => {
      const migrated = migrateValid(
        withControls(schema8Protocol(pedigreeCollecting(['name']))),
      );
      expect(withoutIds(pedigreeOf(migrated).form)).toEqual({
        fields: [AGE_FIELD],
      });
    });

    it('leaves out a field collecting a variable with the id "name", which schema 8 also hid', () => {
      const document = schema8Protocol(
        pedigreeCollecting(['name'], { nodeLabelVariable: 'fullName' }),
      );
      const person = asRecord(
        asRecord(asRecord(document.codebook).node).person,
      );
      person.variables = {
        ...asRecord(person.variables),
        fullName: { name: 'fullName', type: 'text' },
      };
      const migrated = migrateValid(withControls(document));
      expect(pedigreeOf(migrated)).toMatchObject({
        nodeConfiguration: { nameAttribute: 'fullName' },
        form: { fields: [AGE_FIELD] },
      });
    });

    // The redesigned stage asks every person's sex assigned at birth itself,
    // with the same fixed options a field on that attribute had to offer.
    it('leaves out a field collecting sex assigned at birth, which the stage asks itself', () => {
      const migrated = migrateValid(
        withControls(schema8Protocol(pedigreeCollecting(['biologicalSex']))),
      );
      expect(withoutIds(pedigreeOf(migrated).form)).toEqual({
        fields: [AGE_FIELD],
      });
    });

    it('leaves the form out when it collected nothing else', () => {
      const pedigree = schema8Pedigree();
      (pedigree.nodeConfig as Fields).form = [
        { variable: 'name', prompt: 'Their name?' },
        { variable: 'biologicalSex', prompt: 'Their sex at birth?' },
      ];
      const migrated = migrateValid(withControls(schema8Protocol([pedigree])));
      expect(pedigreeOf(migrated)).not.toHaveProperty('form');
    });

    // The field's answer decided who the prompt started with selected, and
    // schema 9 cannot ask both, so the researcher chooses.
    it('leaves a field collecting a nomination prompt’s attribute for validation to refuse', () => {
      const document = withControls(
        schema8Protocol(pedigreeCollecting(['hasCondition'])),
      );
      expect(withoutIds(pedigreeOf(migrateStep(document)).form)).toEqual({
        fields: [
          AGE_FIELD,
          {
            variable: 'hasCondition',
            prompt: en('Their hasCondition?'),
          },
        ],
      });
      expect(() => migrateValid(document)).toThrow(MigrationResultInvalidError);
      expect(() => migrateValid(document)).toThrow(
        'Attribute \\"hasCondition\\" is the nomination prompt attribute of this Family Pedigree stage, which the stage records itself, so its additional person fields cannot collect it as well.',
      );
    });
  });

  describe('fixed options', () => {
    it('relabels sex at birth and relationship kind, keeping their values', () => {
      const migrated = migrateValid(schema8Protocol());
      expect(
        variableAt(migrated, 'node', 'person', 'biologicalSex')?.options,
      ).toEqual(localizedOptions(PEDIGREE_SEX_ASSIGNED_AT_BIRTH_OPTIONS));
      expect(
        variableAt(migrated, 'edge', 'family', 'relationshipType')?.options,
      ).toEqual(localizedOptions(PEDIGREE_RELATIONSHIP_KIND_OPTIONS));
    });

    it('keeps the attributes the redesigned stage no longer uses', () => {
      const migrated = migrateValid(schema8Protocol());
      expect(variableAt(migrated, 'edge', 'family', 'gameteRole')).toEqual({
        name: 'gameteRole',
        type: 'categorical',
        options: localizedOptions(SCHEMA_8_GAMETE_ROLE_OPTIONS),
      });
      expect(
        variableAt(migrated, 'node', 'person', 'relationshipToEgo'),
      ).toEqual({
        name: 'relationshipToEgo',
        type: 'text',
      });
    });

    it('leaves the relationship to the participant unrecorded, rather than binding the old text attribute', () => {
      // Schema 8 wrote English text; the schema 9 binding holds fixed
      // categorical values, which a text attribute cannot. The migration
      // notes tell the researcher how to record it again.
      const migrated = migrateValid(schema8Protocol());
      const nodeConfiguration = pedigreeOf(migrated)?.nodeConfiguration;
      expect(nodeConfiguration).not.toHaveProperty(
        'relationshipToParticipantAttribute',
      );
    });

    it('leaves options whose values differ for validation to report', () => {
      const document = schema8Protocol();
      const sex = variableAt(document, 'node', 'person', 'biologicalSex');
      if (!sex) throw new Error('No sex attribute');
      sex.options = [
        { value: 'female', label: 'Female' },
        { value: 'male', label: 'Male' },
      ];
      expect(
        variableAt(migrateStep(document), 'node', 'person', 'biologicalSex')
          ?.options,
      ).toEqual(
        localizedOptions(sex.options as { value: string; label: string }[]),
      );
      expect(() => migrateValid(document)).toThrow(
        /must keep its fixed options/,
      );
    });
  });

  it('converts a pedigree with every optional piece missing', () => {
    const pedigree = schema8Pedigree({
      boundaries: {
        requireGrandparents: 'off',
        requireChildrenContributors: 'off',
      },
    });
    delete pedigree.introScreen;
    delete pedigree.nominationPrompts;
    delete pedigree.interviewScript;
    delete (pedigree.nodeConfig as Fields).form;

    const migrated = migrateValid(schema8Protocol([pedigree]));
    expect(withoutIds(stagesOf(migrated))).toEqual([
      {
        type: 'FamilyPedigree',
        label: en('Your family'),
        subject: { entity: 'node', type: 'person' },
        prompt: en('Who is in your family? {braces} it’s fine'),
        nodeConfiguration: {
          nameAttribute: 'name',
          sexAssignedAtBirthAttribute: 'biologicalSex',
          egoAttribute: 'isEgo',
        },
        edgeConfiguration: {
          type: 'family',
          kindAttribute: 'relationshipType',
          gestationalCarrierAttribute: 'isGestationalCarrier',
          currentPartnerAttribute: 'isActive',
        },
        framing: 'gendered',
        completeness: {
          scope: 'parents',
          enforcement: 'required',
          relativesNotRecordedAttribute: 'relativesNotRecorded',
        },
      },
      expect.objectContaining({ type: 'FinishSession' }),
    ]);
  });

  it('leaves a key schema 8 required, and the document lacked, for validation to report', () => {
    const pedigree = schema8Pedigree();
    delete pedigree.censusPrompt;
    delete (pedigree.edgeConfig as Fields).isActiveVariable;
    const migrated = migrateStep(schema8Protocol([pedigree]));
    expect(pedigreeOf(migrated)).not.toHaveProperty('prompt');
    expect(pedigreeOf(migrated).edgeConfiguration).not.toHaveProperty(
      'currentPartnerAttribute',
    );
    expect(() => migrateValid(schema8Protocol([pedigree]))).toThrow(
      MigrationResultInvalidError,
    );
  });

  // The chain runs each step once, from the version a document declares, so
  // the step is never given its own output. A stage already in the schema 9
  // shape is still left as it is, apart from its new ids, rather than
  // converted again.
  it('leaves a pedigree already in the schema 9 shape as it is', () => {
    const migrated = migrateStep(schema8Protocol());
    const converted = structuredClone(pedigreeOf(migrated));
    const again = migrateStep({
      ...schema8Protocol([]),
      stages: [converted],
    });
    expect(withoutIds(stagesOf(again))).toEqual([
      withoutIds(converted),
      expect.objectContaining({ type: 'FinishSession' }),
    ]);
  });

  describe('the released CEGRM template', () => {
    // validated end-to-end once the narrative rename lands: until schema 9's
    // Narrative Pedigree names a disease's attribute `attribute`, the
    // template is validated without its Narrative Pedigree.
    const withoutNarrativePedigree = (): Fields => {
      const document = structuredClone(ecoGeneticTemplate) as Fields;
      document.stages = stagesOf(document).filter(
        (stage) => stage.type !== 'NarrativePedigree',
      );
      return document;
    };

    it('migrates to a protocol schema 9 accepts', () => {
      const document = withoutNarrativePedigree();
      const migrated = migrateValid(document);
      const renamedIn = (ids: string[]) =>
        ids.map((id) => migratedStageId(document, migrated, id));

      expect(stageIds(migrated)).toEqual([
        ...renamedIn([
          'information-researcher-notes',
          'information-intro',
          'ego-form-background',
        ]),
        introductionOf(migrated).id,
        ...renamedIn([
          'family-pedigree',
          'information-beyond-family',
          'ng-non-kin',
          'bin-tie-type',
          'bin-closeness',
          'bin-contact-frequency',
          'socio-exchanges',
          'socio-roles',
          'narrative-cegrm',
          'information-close',
        ]),
        expect.any(String),
      ]);
      expect(stageTypes(migrated).at(-1)).toBe('FinishSession');
      expect(pedigreeOf(migrated)).toMatchObject({
        subject: { entity: 'node', type: 'person' },
        prompt: en("Let's map out your family. Who is in it?"),
        nodeConfiguration: {
          nameAttribute: 'name',
          sexAssignedAtBirthAttribute: 'biologicalSex',
          egoAttribute: 'is_ego',
        },
        edgeConfiguration: {
          type: 'family_relationship',
          kindAttribute: 'relationshipType',
          gestationalCarrierAttribute: 'isGestationalCarrier',
          currentPartnerAttribute: 'isActive',
        },
        framing: 'participantPreference',
        completeness: {
          scope: 'grandparents',
          enforcement: 'recommended',
          relativesNotRecordedAttribute: 'relativesNotRecorded',
        },
        form: {
          fields: [{ variable: 'living_status' }, { variable: 'birth_year' }],
        },
        nominationPrompts: [
          { attribute: 'has_condition' },
          { attribute: 'had_testing' },
        ],
      });
      expect(introductionOf(migrated)).toMatchObject({
        type: 'Information',
        content: expect.objectContaining({
          en: expect.stringMatching(/^# Introduction\n\n/),
        }),
      });
      expect(
        variableAt(migrated, 'node', 'person', 'biologicalSex')?.options,
      ).toEqual(localizedOptions(PEDIGREE_SEX_ASSIGNED_AT_BIRTH_OPTIONS));
    });

    it('keeps its Narrative Pedigree pointed at the converted pedigree', () => {
      // validated end-to-end once the narrative rename lands
      const document = structuredClone(ecoGeneticTemplate);
      const migrated = migrateStep(document);
      expect(
        stageById(
          migrated,
          migratedStageId(document, migrated, 'narrative-pedigree'),
        ),
      ).toMatchObject({
        type: 'NarrativePedigree',
        sourceStageId: migratedStageId(document, migrated, 'family-pedigree'),
        diseases: [
          {
            label: en('This condition'),
            color: 'node-color-seq-1',
            attribute: 'has_condition',
            inheritancePattern: 'unknown',
          },
        ],
      });
    });
  });
});

describe('v8 to v9 Narrative Pedigree migration', () => {
  const narrativePedigree = (diseases: Fields[]): Fields => ({
    id: 'narrative',
    type: 'NarrativePedigree',
    label: 'How it runs in the family',
    sourceStageId: 'pedigree',
    showAtRiskStatuses: true,
    diseases,
  });

  // validated end-to-end once the narrative rename lands
  it('names each disease’s attribute `attribute`, keeping the rest of the row', () => {
    const document = schema8Protocol([
      schema8Pedigree(),
      narrativePedigree([
        {
          id: 'condition',
          label: 'The condition',
          color: 'node-color-seq-1',
          variable: 'hasCondition',
          inheritancePattern: 'autosomalDominant',
        },
        {
          id: 'testing',
          label: 'Tested',
          color: 'node-color-seq-2',
          variable: 'hadTesting',
          inheritancePattern: 'unknown',
        },
      ]),
    ]);
    const migrated = migrateStep(document);
    const stage = stageById(
      migrated,
      migratedStageId(document, migrated, 'narrative'),
    );
    expect(withoutIds(stage)).toEqual({
      type: 'NarrativePedigree',
      label: en('How it runs in the family'),
      sourceStageId: migratedStageId(document, migrated, 'pedigree'),
      showAtRiskStatuses: true,
      // The wording Network Canvas supplies is not written into the stage.
      diseases: [
        {
          label: en('The condition'),
          color: 'node-color-seq-1',
          attribute: 'hasCondition',
          inheritancePattern: 'autosomalDominant',
        },
        {
          label: en('Tested'),
          color: 'node-color-seq-2',
          attribute: 'hadTesting',
          inheritancePattern: 'unknown',
        },
      ],
    });
    expect(
      Array.isArray(stage.diseases) && isRecord(stage.diseases[0])
        ? Object.keys(stage.diseases[0])
        : [],
    ).toEqual(['id', 'label', 'color', 'attribute', 'inheritancePattern']);
  });

  it('leaves a row that already names its attribute as it is', () => {
    const disease = {
      id: 'condition',
      label: 'The condition',
      color: 'node-color-seq-1',
      attribute: 'hasCondition',
      inheritancePattern: 'unknown',
    };
    const document = schema8Protocol([
      schema8Pedigree(),
      narrativePedigree([disease]),
    ]);
    const migrated = migrateStep(document);
    expect(
      withoutIds(
        stageById(migrated, migratedStageId(document, migrated, 'narrative'))
          .diseases,
      ),
    ).toEqual(withoutIds([{ ...disease, label: en('The condition') }]));
  });
});
