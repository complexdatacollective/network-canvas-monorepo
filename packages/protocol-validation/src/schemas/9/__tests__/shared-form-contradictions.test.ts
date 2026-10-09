import { describe, expect, it } from 'vitest';

import { withFinishStage } from '../../../__tests__/finishStage.ts';
import {
  createBaseProtocol,
  localized,
  localizedOptions,
} from '../../../utils/test-utils.ts';
import {
  PEDIGREE_RELATIONSHIP_KIND_OPTIONS,
  PEDIGREE_SEX_ASSIGNED_AT_BIRTH_OPTIONS,
} from '../family-pedigree-values.ts';
import ProtocolSchemaV9 from '../schema.ts';
import { pedigreeNameField } from './family-pedigree-text.ts';
import {
  GENDER_IDENTITY_OPTIONS,
  GENDER_IDENTITY_TERMS,
} from './pedigreeGenderFixtures.ts';

const booleanPair = {
  boolA: {
    name: 'BoolA',
    label: 'BoolA',
    type: 'boolean',
    component: 'Boolean',
    options: [{ label: localized('Yes'), value: true }],
    validation: { differentFrom: 'boolB' },
  },
  boolB: {
    name: 'BoolB',
    label: 'BoolB',
    type: 'boolean',
    component: 'Boolean',
    options: [{ label: localized('Yes'), value: true }],
  },
};

const formFields = [
  { variable: 'boolA', prompt: localized('First?') },
  { variable: 'boolB', prompt: localized('Second?') },
];

const introductionPanel = {
  title: localized('About this form'),
  text: localized('Answer the questions.'),
};

const withEgoPair = () => {
  const base = createBaseProtocol();
  return {
    ...base,
    codebook: {
      ...base.codebook,
      ego: {
        variables: {
          ...base.codebook.ego.variables,
          ...booleanPair,
        },
      },
    },
  };
};

const withNodePair = () => {
  const base = createBaseProtocol();
  return {
    ...base,
    codebook: {
      ...base.codebook,
      node: {
        ...base.codebook.node,
        person: {
          ...base.codebook.node.person,
          variables: {
            ...base.codebook.node.person.variables,
            ...booleanPair,
          },
        },
      },
    },
  };
};

const withEdgePair = () => {
  const base = createBaseProtocol();
  return {
    ...base,
    codebook: {
      ...base.codebook,
      edge: {
        ...base.codebook.edge,
        knows: {
          ...base.codebook.edge.knows,
          variables: {
            ...base.codebook.edge.knows.variables,
            ...booleanPair,
          },
        },
      },
    },
  };
};

const familyPedigreeProtocol = () => ({
  name: 'Family protocol',
  schemaVersion: 9 as const,
  localization: { defaultLocale: 'en', locales: ['en'] },
  codebook: {
    node: {
      person: {
        name: 'Person',
        label: localized('Person'),
        color: 'node-color-seq-1',
        shape: { default: 'circle' },
        variables: {
          label: {
            name: 'Label',
            label: 'Label',
            type: 'text',
            component: 'Text',
          },
          isEgo: { name: 'IsEgo', label: 'IsEgo', type: 'boolean' },
          genderIdentity: {
            name: 'GenderIdentity',
            label: 'GenderIdentity',
            type: 'categorical',
            options: GENDER_IDENTITY_OPTIONS,
          },
          sexAssignedAtBirth: {
            name: 'SexAssignedAtBirth',
            label: 'SexAssignedAtBirth',
            type: 'categorical',
            options: localizedOptions(PEDIGREE_SEX_ASSIGNED_AT_BIRTH_OPTIONS),
          },
          ...booleanPair,
        },
      },
    },
    edge: {
      family: {
        name: 'Family',
        label: localized('Family'),
        color: 'edge-color-seq-1',
        variables: {
          relationshipKind: {
            name: 'RelationshipKind',
            label: 'RelationshipKind',
            type: 'categorical',
            options: localizedOptions(PEDIGREE_RELATIONSHIP_KIND_OPTIONS),
          },
          isGestationalCarrier: {
            name: 'IsGestationalCarrier',
            label: 'IsGestationalCarrier',
            type: 'boolean',
          },
          isCurrentPartner: {
            name: 'IsCurrentPartner',
            label: 'IsCurrentPartner',
            type: 'boolean',
          },
        },
      },
    },
  },
  stages: [
    {
      id: 'family',
      type: 'FamilyPedigree',
      label: localized('Family'),
      subject: { entity: 'node', type: 'person' },
      prompt: localized('Build your family'),
      nodeConfiguration: {
        nameAttribute: 'label',
        nameField: pedigreeNameField(),
        genderIdentity: {
          attribute: 'genderIdentity',
          terms: GENDER_IDENTITY_TERMS,
        },
        sexAssignedAtBirthAttribute: 'sexAssignedAtBirth',
        egoAttribute: 'isEgo',
      },
      edgeConfiguration: {
        type: 'family',
        kindAttribute: 'relationshipKind',
        gestationalCarrierAttribute: 'isGestationalCarrier',
        currentPartnerAttribute: 'isCurrentPartner',
      },
      form: { fields: formFields },
    },
  ],
});

describe('shared form stage-effective validation contradictions', () => {
  const cases = [
    {
      label: 'EgoForm',
      protocol: () => ({
        ...withEgoPair(),
        stages: [
          {
            id: 'ego',
            type: 'EgoForm',
            label: localized('Ego'),
            form: { fields: formFields },
            introductionPanel,
          },
        ],
      }),
      expectedPath: ['stages', 0, 'form', 'fields', 0, 'variable'],
    },
    {
      label: 'AlterForm',
      protocol: () => ({
        ...withNodePair(),
        stages: [
          {
            id: 'alter',
            type: 'AlterForm',
            label: localized('Alter'),
            subject: { entity: 'node', type: 'person' },
            form: { fields: formFields },
            introductionPanel,
          },
        ],
      }),
      expectedPath: ['stages', 0, 'form', 'fields', 0, 'variable'],
    },
    {
      label: 'AlterEdgeForm',
      protocol: () => ({
        ...withEdgePair(),
        stages: [
          {
            id: 'edge',
            type: 'AlterEdgeForm',
            label: localized('Edge'),
            subject: { entity: 'edge', type: 'knows' },
            form: { fields: formFields },
            introductionPanel,
          },
        ],
      }),
      expectedPath: ['stages', 0, 'form', 'fields', 0, 'variable'],
    },
    {
      label: 'NameGenerator',
      protocol: () => ({
        ...withNodePair(),
        stages: [
          {
            id: 'names',
            type: 'NameGenerator',
            label: localized('Names'),
            subject: { entity: 'node', type: 'person' },
            form: { title: localized('Add person'), fields: formFields },
            prompts: [{ id: 'prompt', text: localized('Who do you know?') }],
          },
        ],
      }),
      expectedPath: ['stages', 0, 'form', 'fields', 0, 'variable'],
    },
    {
      label: 'FamilyPedigree person form',
      protocol: familyPedigreeProtocol,
      expectedPath: ['stages', 0, 'form', 'fields', 0, 'variable'],
    },
  ];

  it.each(cases)(
    'rejects a contradiction made concrete by a $label',
    ({ protocol, expectedPath }) => {
      const result = ProtocolSchemaV9.safeParse(withFinishStage(protocol()));

      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((candidate) =>
          candidate.message.includes('must differ but their rules pin both'),
        );
        expect(issue?.path).toEqual(expectedPath);
      }
    },
  );

  it('does not report an unrelated latent contradiction through a shared form', () => {
    const base = withNodePair();
    const protocol = {
      ...base,
      stages: [
        {
          id: 'alter',
          type: 'AlterForm',
          label: localized('Alter'),
          subject: { entity: 'node', type: 'person' },
          form: {
            fields: [{ variable: 'name', prompt: localized('Name?') }],
          },
          introductionPanel,
        },
      ],
    };

    expect(ProtocolSchemaV9.safeParse(withFinishStage(protocol)).success).toBe(
      true,
    );
  });

  it('omits an unrendered variable whose codebook component is overridden by another composer form', () => {
    const base = withNodePair();
    const protocol = {
      ...base,
      stages: [
        {
          id: 'alter',
          type: 'AlterForm',
          label: localized('Alter'),
          subject: { entity: 'node', type: 'person' },
          form: {
            fields: [{ variable: 'boolA', prompt: localized('First?') }],
          },
          introductionPanel,
        },
        {
          id: 'composer',
          type: 'NetworkComposer',
          label: localized('Composer'),
          subject: { entity: 'node', type: 'person' },
          quickAdd: 'name',
          layoutVariable: 'layoutPosition',
          background: { concentricCircles: 4 },
          nodeForm: {
            fields: [
              {
                variable: 'boolB',
                component: 'Toggle',
                label: localized('Second?'),
              },
            ],
          },
        },
      ],
    };

    expect(ProtocolSchemaV9.safeParse(withFinishStage(protocol)).success).toBe(
      true,
    );
  });

  it('keeps the codebook rendering of a current field even when another composer form overrides it', () => {
    const base = withNodePair();
    const protocol = {
      ...base,
      stages: [
        {
          id: 'alter',
          type: 'AlterForm',
          label: localized('Alter'),
          subject: { entity: 'node', type: 'person' },
          form: { fields: formFields },
          introductionPanel,
        },
        {
          id: 'composer',
          type: 'NetworkComposer',
          label: localized('Composer'),
          subject: { entity: 'node', type: 'person' },
          quickAdd: 'name',
          layoutVariable: 'layoutPosition',
          background: { concentricCircles: 4 },
          nodeForm: {
            fields: [
              {
                variable: 'boolB',
                component: 'Toggle',
                label: localized('Second?'),
              },
            ],
          },
        },
      ],
    };

    const result = ProtocolSchemaV9.safeParse(withFinishStage(protocol));

    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((candidate) =>
        candidate.message.includes('must differ but their rules pin both'),
      );
      expect(issue?.path).toEqual([
        'stages',
        0,
        'form',
        'fields',
        0,
        'variable',
      ]);
    }
  });

  it('uses the codebook component as the shared form rendering', () => {
    const base = withNodePair();
    const person = base.codebook.node.person;
    const protocol = {
      ...base,
      codebook: {
        ...base.codebook,
        node: {
          ...base.codebook.node,
          person: {
            ...person,
            variables: {
              ...person.variables,
              boolA: {
                name: 'BoolA',
                label: 'BoolA',
                type: 'boolean',
                component: 'Toggle',
                validation: { differentFrom: 'boolB' },
              },
              boolB: {
                name: 'BoolB',
                label: 'BoolB',
                type: 'boolean',
                component: 'Toggle',
              },
            },
          },
        },
      },
      stages: [
        {
          id: 'alter',
          type: 'AlterForm',
          label: localized('Alter'),
          subject: { entity: 'node', type: 'person' },
          form: { fields: formFields },
          introductionPanel,
        },
      ],
    };

    expect(ProtocolSchemaV9.safeParse(withFinishStage(protocol)).success).toBe(
      true,
    );
  });

  it('does not duplicate a contradiction already owned by the codebook', () => {
    const base = createBaseProtocol();
    const person = base.codebook.node.person;
    const protocol = {
      ...base,
      codebook: {
        ...base.codebook,
        node: {
          ...base.codebook.node,
          person: {
            ...person,
            variables: {
              ...person.variables,
              age: {
                ...person.variables.age,
                validation: { minValue: 10, maxValue: 5 },
              },
            },
          },
        },
      },
      stages: [
        {
          id: 'alter',
          type: 'AlterForm',
          label: localized('Alter'),
          subject: { entity: 'node', type: 'person' },
          form: {
            fields: [{ variable: 'age', prompt: localized('Age?') }],
          },
          introductionPanel,
        },
      ],
    };

    const result = ProtocolSchemaV9.safeParse(withFinishStage(protocol));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) =>
          issue.message.startsWith('Form field for'),
        ),
      ).toBe(false);
    }
  });

  it.each([
    {
      label: 'NameGeneratorQuickAdd',
      stage: {
        id: 'quick',
        type: 'NameGeneratorQuickAdd',
        label: localized('Quick add'),
        subject: { entity: 'node', type: 'person' },
        quickAdd: 'name',
        prompts: [{ id: 'prompt', text: localized('Who do you know?') }],
      },
      assetManifest: undefined,
    },
    {
      label: 'NameGeneratorRoster',
      stage: {
        id: 'roster',
        type: 'NameGeneratorRoster',
        label: localized('Roster'),
        subject: { entity: 'node', type: 'person' },
        dataSource: 'roster',
        panelTitle: localized('Available to add'),
        prompts: [{ id: 'prompt', text: localized('Who do you know?') }],
      },
      assetManifest: {
        roster: {
          id: 'roster',
          type: 'network',
          name: 'roster.csv',
          source: 'roster.csv',
        },
      },
    },
  ])(
    'does not extend shared-form validation to $label',
    ({ stage, assetManifest }) => {
      const base = withNodePair();
      const protocol = {
        ...base,
        ...(assetManifest !== undefined ? { assetManifest } : {}),
        stages: [stage],
      };

      expect(
        ProtocolSchemaV9.safeParse(withFinishStage(protocol)).success,
      ).toBe(true);
    },
  );
});
