import { describe, expect, it } from 'vitest';

import {
  BIOLOGICAL_SEX_OPTIONS,
  GAMETE_ROLE_OPTIONS,
  RELATIONSHIP_TYPE_OPTIONS,
} from '@codaco/shared-consts';

import { createBaseProtocol } from '../../../utils/test-utils.ts';
import ProtocolSchemaV8 from '../schema.ts';

const booleanPair = {
  boolA: {
    name: 'BoolA',
    type: 'boolean',
    component: 'Boolean',
    options: [{ label: 'Yes', value: true }],
    validation: { differentFrom: 'boolB' },
  },
  boolB: {
    name: 'BoolB',
    type: 'boolean',
    component: 'Boolean',
    options: [{ label: 'Yes', value: true }],
  },
};

const formFields = [
  { variable: 'boolA', prompt: 'First?' },
  { variable: 'boolB', prompt: 'Second?' },
];

const introductionPanel = {
  title: 'About this form',
  text: 'Answer the questions.',
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
  schemaVersion: 8 as const,
  codebook: {
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        shape: { default: 'circle' },
        variables: {
          label: { name: 'Label', type: 'text', component: 'Text' },
          isEgo: { name: 'IsEgo', type: 'boolean' },
          relationship: { name: 'Relationship', type: 'text' },
          biologicalSex: {
            name: 'BiologicalSex',
            type: 'categorical',
            options: BIOLOGICAL_SEX_OPTIONS,
          },
          ...booleanPair,
        },
      },
    },
    edge: {
      family: {
        name: 'Family',
        color: 'edge-color-seq-1',
        variables: {
          relationshipType: {
            name: 'RelationshipType',
            type: 'categorical',
            options: RELATIONSHIP_TYPE_OPTIONS,
          },
          isActive: { name: 'IsActive', type: 'boolean' },
          isGestationalCarrier: {
            name: 'IsGestationalCarrier',
            type: 'boolean',
          },
          gameteRole: {
            name: 'GameteRole',
            type: 'categorical',
            options: GAMETE_ROLE_OPTIONS,
          },
        },
      },
    },
  },
  stages: [
    {
      id: 'family',
      type: 'FamilyPedigree',
      label: 'Family',
      nodeConfig: {
        type: 'person',
        nodeLabelVariable: 'label',
        egoVariable: 'isEgo',
        relationshipVariable: 'relationship',
        biologicalSexVariable: 'biologicalSex',
        form: formFields,
      },
      edgeConfig: {
        type: 'family',
        relationshipTypeVariable: 'relationshipType',
        isActiveVariable: 'isActive',
        isGestationalCarrierVariable: 'isGestationalCarrier',
        gameteRoleVariable: 'gameteRole',
      },
      framing: { mode: 'fixed', value: 'gamete' },
      boundaries: {
        requireGrandparents: 'off',
        requireChildrenContributors: 'off',
      },
      censusPrompt: 'Build your family',
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
            label: 'Ego',
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
            label: 'Alter',
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
            label: 'Edge',
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
            label: 'Names',
            subject: { entity: 'node', type: 'person' },
            form: { title: 'Add person', fields: formFields },
            prompts: [{ id: 'prompt', text: 'Who do you know?' }],
          },
        ],
      }),
      expectedPath: ['stages', 0, 'form', 'fields', 0, 'variable'],
    },
    {
      label: 'FamilyPedigree node form',
      protocol: familyPedigreeProtocol,
      expectedPath: ['stages', 0, 'nodeConfig', 'form', 0, 'variable'],
    },
  ];

  it.each(cases)(
    'rejects a contradiction made concrete by a $label',
    ({ protocol, expectedPath }) => {
      const result = ProtocolSchemaV8.safeParse(protocol());

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
          label: 'Alter',
          subject: { entity: 'node', type: 'person' },
          form: {
            fields: [{ variable: 'name', prompt: 'Name?' }],
          },
          introductionPanel,
        },
      ],
    };

    expect(ProtocolSchemaV8.safeParse(protocol).success).toBe(true);
  });

  it('omits an unrendered variable whose codebook component is overridden by another composer form', () => {
    const base = withNodePair();
    const protocol = {
      ...base,
      stages: [
        {
          id: 'alter',
          type: 'AlterForm',
          label: 'Alter',
          subject: { entity: 'node', type: 'person' },
          form: {
            fields: [{ variable: 'boolA', prompt: 'First?' }],
          },
          introductionPanel,
        },
        {
          id: 'composer',
          type: 'NetworkComposer',
          label: 'Composer',
          subject: { entity: 'node', type: 'person' },
          quickAdd: 'name',
          layoutVariable: 'layoutPosition',
          background: { concentricCircles: 4 },
          nodeForm: {
            fields: [
              {
                variable: 'boolB',
                component: 'Toggle',
                label: 'Second?',
              },
            ],
          },
        },
      ],
    };

    expect(ProtocolSchemaV8.safeParse(protocol).success).toBe(true);
  });

  it('keeps the codebook rendering of a current field even when another composer form overrides it', () => {
    const base = withNodePair();
    const protocol = {
      ...base,
      stages: [
        {
          id: 'alter',
          type: 'AlterForm',
          label: 'Alter',
          subject: { entity: 'node', type: 'person' },
          form: { fields: formFields },
          introductionPanel,
        },
        {
          id: 'composer',
          type: 'NetworkComposer',
          label: 'Composer',
          subject: { entity: 'node', type: 'person' },
          quickAdd: 'name',
          layoutVariable: 'layoutPosition',
          background: { concentricCircles: 4 },
          nodeForm: {
            fields: [
              {
                variable: 'boolB',
                component: 'Toggle',
                label: 'Second?',
              },
            ],
          },
        },
      ],
    };

    const result = ProtocolSchemaV8.safeParse(protocol);

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
                type: 'boolean',
                component: 'Toggle',
                validation: { differentFrom: 'boolB' },
              },
              boolB: {
                name: 'BoolB',
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
          label: 'Alter',
          subject: { entity: 'node', type: 'person' },
          form: { fields: formFields },
          introductionPanel,
        },
      ],
    };

    expect(ProtocolSchemaV8.safeParse(protocol).success).toBe(true);
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
          label: 'Alter',
          subject: { entity: 'node', type: 'person' },
          form: {
            fields: [{ variable: 'age', prompt: 'Age?' }],
          },
          introductionPanel,
        },
      ],
    };

    const result = ProtocolSchemaV8.safeParse(protocol);

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
        label: 'Quick add',
        subject: { entity: 'node', type: 'person' },
        quickAdd: 'name',
        prompts: [{ id: 'prompt', text: 'Who do you know?' }],
      },
      assetManifest: undefined,
    },
    {
      label: 'NameGeneratorRoster',
      stage: {
        id: 'roster',
        type: 'NameGeneratorRoster',
        label: 'Roster',
        subject: { entity: 'node', type: 'person' },
        dataSource: 'roster',
        prompts: [{ id: 'prompt', text: 'Who do you know?' }],
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

      expect(ProtocolSchemaV8.safeParse(protocol).success).toBe(true);
    },
  );
});
