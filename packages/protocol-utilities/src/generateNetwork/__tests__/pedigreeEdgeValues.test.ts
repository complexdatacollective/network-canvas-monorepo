import { describe, expect, it } from 'vitest';

import {
  asEntityAttributeReference,
  type Stage,
  type StructuralCodebook,
} from '@codaco/protocol-validation';
import {
  BIOLOGICAL_SEX_OPTIONS,
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  GAMETE_ROLE_OPTIONS,
  RELATIONSHIP_TYPE_OPTIONS,
  type NcEdge,
  type NcNode,
} from '@codaco/shared-consts';

import { generateNetwork } from '../../generateNetwork';
import { US_FAMILY_PEDIGREE_POPULATION } from '../familyPedigree/referencePopulation';
import { PEDIGREE_RELATIONSHIP_TO_EGO_VALUES } from '../familyPedigree/types';

const familyStage = {
  id: 'family-stage',
  type: 'FamilyPedigree',
  label: 'Family',
  nodeConfig: {
    type: 'family-member',
    nodeLabelVariable: 'name',
    egoVariable: 'isEgo',
    relationshipVariable: 'relationship',
    biologicalSexVariable: 'biologicalSex',
  },
  edgeConfig: {
    type: 'family-edge',
    relationshipTypeVariable: 'relationshipType',
    isActiveVariable: 'isActive',
    isGestationalCarrierVariable: 'isGestationalCarrier',
    gameteRoleVariable: 'gameteRole',
  },
  framing: { mode: 'fixed', value: 'gamete' },
  boundaries: {
    requireGrandparents: 'required',
    requireChildrenContributors: 'off',
  },
  censusPrompt: 'Build your family.',
  nominationPrompts: [
    { id: 'condition', text: 'Who has this condition?', variable: 'condition' },
  ],
} as unknown as Stage;

const narrativeDisease = {
  id: 'condition',
  label: 'Condition',
  color: '#cc0000',
  variable: 'condition',
  inheritancePattern: 'autosomalDominant',
} as const;

const narrativeStage = {
  id: 'narrative-stage',
  type: 'NarrativePedigree',
  label: 'Disease',
  sourceStageId: familyStage.id,
  showAtRiskStatuses: true,
  diseases: [narrativeDisease],
} as unknown as Stage;

const codebook = {
  node: {
    'family-member': {
      name: 'Family member',
      color: 'node-color-seq-1',
      variables: {
        name: {
          name: 'Name',
          type: 'text',
          validation: { unique: true },
        },
        isEgo: { name: 'Is ego', type: 'boolean' },
        relationship: { name: 'Relationship', type: 'text' },
        biologicalSex: {
          name: 'Biological sex',
          type: 'categorical',
          options: BIOLOGICAL_SEX_OPTIONS,
        },
        condition: { name: 'Condition', type: 'boolean' },
        generationMarker: {
          name: 'Generation marker',
          type: 'ordinal',
          options: [
            { label: 'Earlier', value: 1 },
            { label: 'Same', value: 2 },
            { label: 'Later', value: 3 },
          ],
        },
      },
    },
    'person': {
      name: 'Person',
      color: 'node-color-seq-2',
      variables: {
        ordinaryName: { name: 'Name', type: 'text' },
        age: { name: 'Age', type: 'number' },
      },
    },
  },
  edge: {
    'family-edge': {
      name: 'Family edge',
      color: 'edge-color-seq-1',
      variables: {
        relationshipType: {
          name: 'Relationship type',
          type: 'categorical',
          options: RELATIONSHIP_TYPE_OPTIONS,
        },
        isActive: { name: 'Is active', type: 'boolean' },
        isGestationalCarrier: {
          name: 'Is gestational carrier',
          type: 'boolean',
        },
        gameteRole: {
          name: 'Gamete role',
          type: 'categorical',
          options: GAMETE_ROLE_OPTIONS,
        },
      },
    },
  },
} as unknown as StructuralCodebook;

function family(
  seed = 42,
  scenario: 'none' | 'adoption' | 'donorConception' | 'surrogacy' = 'none',
) {
  return generateNetwork({
    seed,
    codebook,
    stages: [familyStage, narrativeStage],
    familyPedigree: { scenario },
  });
}

function relation(edge: NcEdge): string | undefined {
  const value = edge[entityAttributesProperty].relationshipType;
  return Array.isArray(value) ? String(value[0]) : undefined;
}

function withoutUids(nodes: NcNode[], edges: NcEdge[]) {
  const positions = new Map(
    nodes.map((node, index) => [node[entityPrimaryKeyProperty], index]),
  );
  return {
    nodes: nodes.map((node) => ({
      type: node.type,
      attributes: node[entityAttributesProperty],
      stageId: node.stageId,
    })),
    edges: edges.map((edge) => ({
      type: edge.type,
      from: positions.get(edge.from),
      to: positions.get(edge.to),
      attributes: edge[entityAttributesProperty],
    })),
  };
}

describe('FamilyPedigree materialization', () => {
  it('writes every required node semantic and a committed membership snapshot', () => {
    const { network, stageMetadata } = family();
    const egos = network.nodes.filter(
      (node) => node[entityAttributesProperty].isEgo === true,
    );
    expect(egos).toHaveLength(1);
    expect(network.nodes[0]).toBe(egos[0]);
    expect(
      new Set(network.nodes.map((node) => node[entityAttributesProperty].name))
        .size,
    ).toBe(network.nodes.length);

    for (const node of network.nodes) {
      const attributes = node[entityAttributesProperty];
      expect(typeof attributes.name).toBe('string');
      expect(typeof attributes.isEgo).toBe('boolean');
      if (attributes.isEgo === true) {
        expect(attributes.relationship).toBeUndefined();
      } else if (attributes.relationship !== undefined) {
        expect(PEDIGREE_RELATIONSHIP_TO_EGO_VALUES).toContain(
          attributes.relationship,
        );
      }
      expect(BIOLOGICAL_SEX_OPTIONS.map(({ value }) => value)).toContain(
        Array.isArray(attributes.biologicalSex)
          ? attributes.biologicalSex[0]
          : undefined,
      );
      expect(typeof attributes.condition).toBe('boolean');
    }

    const metadata = stageMetadata?.[0] as
      | { nodes?: { id: string }[]; edges?: { id: string }[] }
      | undefined;
    expect(metadata?.nodes?.map(({ id }) => id).toSorted()).toEqual(
      network.nodes.map((node) => node[entityPrimaryKeyProperty]).toSorted(),
    );
    expect(metadata?.edges?.map(({ id }) => id).toSorted()).toEqual(
      network.edges.map((edge) => edge[entityPrimaryKeyProperty]).toSorted(),
    );
  });

  it('uses interface-valid relationship, gamete, activity, and carrier semantics', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const { network } = family(seed);
      for (const edge of network.edges) {
        const attributes = edge[entityAttributesProperty];
        expect(RELATIONSHIP_TYPE_OPTIONS.map(({ value }) => value)).toContain(
          relation(edge),
        );
        expect(typeof attributes.isActive).toBe('boolean');

        if (relation(edge) === 'biological' || relation(edge) === 'donor') {
          expect(GAMETE_ROLE_OPTIONS.map(({ value }) => value)).toContain(
            Array.isArray(attributes.gameteRole)
              ? attributes.gameteRole[0]
              : undefined,
          );
        } else {
          expect(attributes.gameteRole).toBeUndefined();
        }

        if (relation(edge) === 'partner') {
          expect(attributes.isGestationalCarrier).toBeUndefined();
        }
      }
    }
  });

  it('includes eligible nodes from earlier stages in committed membership', () => {
    const earlierStage = {
      id: 'earlier-family-members',
      type: 'NameGenerator',
      label: 'Earlier family members',
      subject: { entity: 'node', type: 'family-member' },
      prompts: [{ id: 'people', text: 'Name people' }],
      behaviours: { minNodes: 2, maxNodes: 2 },
    } as unknown as Stage;
    const { network, stageMetadata } = generateNetwork({
      seed: 42,
      codebook,
      stages: [earlierStage, familyStage, narrativeStage],
    });
    const earlierNodeIds = network.nodes
      .filter((node) => node.stageId === earlierStage.id)
      .map((node) => node[entityPrimaryKeyProperty]);
    const metadata = stageMetadata?.[1] as
      | { nodes?: { id: string }[] }
      | undefined;
    const metadataNodeIds = metadata?.nodes?.map(({ id }) => id) ?? [];

    expect(earlierNodeIds).toHaveLength(2);
    expect(
      network.nodes
        .filter((node) => node.stageId === earlierStage.id)
        .every((node) => node[entityAttributesProperty].isEgo === false),
    ).toBe(true);
    expect(
      network.nodes.filter(
        (node) => node[entityAttributesProperty].isEgo === true,
      ),
    ).toHaveLength(1);
    expect(metadataNodeIds).toEqual(expect.arrayContaining(earlierNodeIds));
    expect(metadataNodeIds.toSorted()).toEqual(
      network.nodes
        .filter((node) => node.type === 'family-member')
        .map((node) => node[entityPrimaryKeyProperty])
        .toSorted(),
    );
  });

  it('includes eligible edges from earlier stages in committed membership', () => {
    const earlierStage = {
      id: 'earlier-family-members',
      type: 'NameGenerator',
      label: 'Earlier family members',
      subject: { entity: 'node', type: 'family-member' },
      prompts: [{ id: 'people', text: 'Name people' }],
      behaviours: { minNodes: 2, maxNodes: 2 },
    } as unknown as Stage;
    const earlierEdges = {
      id: 'earlier-family-links',
      type: 'Sociogram',
      label: 'Earlier family links',
      subject: { entity: 'node', type: 'family-member' },
      prompts: [
        {
          id: 'links',
          text: 'Connect them',
          edges: { create: 'family-edge' },
        },
      ],
    } as unknown as Stage;
    const { network, stageMetadata } = generateNetwork({
      seed: 42,
      codebook,
      stages: [earlierStage, earlierEdges, familyStage, narrativeStage],
      config: { sociogramEdgeProbability: { min: 1, max: 1 } },
    });
    const earlierNodeIds = new Set(
      network.nodes
        .filter((node) => node.stageId === earlierStage.id)
        .map((node) => node[entityPrimaryKeyProperty]),
    );
    const inheritedEdgeIds = network.edges
      .filter(
        (edge) => earlierNodeIds.has(edge.from) && earlierNodeIds.has(edge.to),
      )
      .map((edge) => edge[entityPrimaryKeyProperty]);
    const metadata = stageMetadata?.[2] as
      | { edges?: { id: string }[] }
      | undefined;
    const metadataEdgeIds = metadata?.edges?.map(({ id }) => id) ?? [];

    expect(inheritedEdgeIds).toHaveLength(1);
    expect(metadataEdgeIds).toEqual(expect.arrayContaining(inheritedEdgeIds));
  });

  it('normalizes inherited ego and disease flags through their constraint component', () => {
    const constrainedCodebook = structuredClone(codebook);
    const variables = constrainedCodebook.node?.['family-member']?.variables;
    if (!variables) throw new Error('missing family-member variables');
    variables.egoMirror = {
      name: 'Ego mirror',
      type: 'boolean',
      validation: { sameAs: asEntityAttributeReference('isEgo') },
    };
    const earlierStage = {
      id: 'earlier-family-member',
      type: 'NameGenerator',
      label: 'Earlier family member',
      subject: { entity: 'node', type: 'family-member' },
      prompts: [
        {
          id: 'person',
          text: 'Name a person',
          additionalAttributes: [
            { variable: 'isEgo', value: true },
            { variable: 'egoMirror', value: true },
            { variable: 'condition', value: true },
            { variable: 'generationMarker', value: 2 },
          ],
        },
      ],
      behaviours: { minNodes: 1, maxNodes: 1 },
    } as unknown as Stage;
    const { network } = generateNetwork({
      seed: 42,
      codebook: constrainedCodebook,
      stages: [earlierStage, familyStage, narrativeStage],
      familyPedigree: {
        scenario: 'none',
        diseaseMode: 'none',
        maxNodes: 7,
      },
    });
    const inherited = network.nodes.find(
      (node) => node.stageId === earlierStage.id,
    );

    expect(inherited?.[entityAttributesProperty]).toEqual(
      expect.objectContaining({
        isEgo: false,
        egoMirror: false,
        condition: false,
        generationMarker: 2,
      }),
    );
  });

  it('reuses an earlier pedigree ego without changing its identity', () => {
    const laterFamilyStage = {
      ...familyStage,
      id: 'later-family-stage',
      label: 'Later family',
    } as unknown as Stage;
    const { network, stageMetadata } = generateNetwork({
      seed: 42,
      codebook,
      stages: [familyStage, laterFamilyStage],
      familyPedigree: {
        scenario: 'none',
        diseaseMode: 'none',
        maxNodes: 7,
      },
    });
    const firstMetadata = stageMetadata?.[0] as
      | { nodes?: { id: string; isEgo: boolean }[] }
      | undefined;
    const laterMetadata = stageMetadata?.[1] as
      | { nodes?: { id: string; isEgo: boolean }[] }
      | undefined;
    const firstEgo = firstMetadata?.nodes?.find(({ isEgo }) => isEgo);
    const laterEgos = laterMetadata?.nodes?.filter(({ isEgo }) => isEgo) ?? [];

    if (!firstEgo) throw new Error('missing first pedigree ego');
    expect(laterEgos).toEqual([{ id: firstEgo.id, label: 'You', isEgo: true }]);
    expect(
      network.nodes.filter(
        (node) => node[entityAttributesProperty].isEgo === true,
      ),
    ).toHaveLength(1);
    expect(
      network.nodes.find(
        (node) => node[entityPrimaryKeyProperty] === firstEgo.id,
      )?.[entityAttributesProperty].isEgo,
    ).toBe(true);
  });

  it('uses the reused ego biological sex for later pedigree parentage', () => {
    const laterFamilyStage = {
      ...familyStage,
      id: 'later-family-stage',
      label: 'Later family',
    } as unknown as Stage;
    const population = {
      ...US_FAMILY_PEDIGREE_POPULATION,
      completedFamilySize: [{ value: 2, weight: 1 }],
      childlessPartnerProbability: 0,
      scenarios: { adoption: 0, donorConception: 0, surrogacy: 0 },
    };
    // The two stage-local streams draw opposite ego sexes for this seed unless
    // the second plan is explicitly anchored to the already-committed ego.
    const { network } = generateNetwork({
      seed: 2,
      codebook,
      stages: [familyStage, laterFamilyStage],
      familyPedigree: {
        population,
        scenario: 'none',
        diseaseMode: 'none',
        maxNodes: 20,
      },
    });
    const ego = network.nodes.find(
      (node) => node[entityAttributesProperty].isEgo === true,
    );
    const laterChild = network.nodes.find(
      (node) =>
        node.stageId === laterFamilyStage.id &&
        node[entityAttributesProperty].relationship === 'Child',
    );
    if (!ego || !laterChild) throw new Error('missing later child branch');

    const egoParentage = network.edges.find(
      (edge) =>
        edge.from === ego[entityPrimaryKeyProperty] &&
        edge.to === laterChild[entityPrimaryKeyProperty],
    );
    const biologicalSex = ego[entityAttributesProperty].biologicalSex;
    const expectedRole =
      Array.isArray(biologicalSex) && biologicalSex[0] === 'female'
        ? 'egg'
        : 'sperm';

    expect(egoParentage?.[entityAttributesProperty].gameteRole).toEqual([
      expectedRole,
    ]);
  });

  it('preserves disease assignments owned by an earlier pedigree', () => {
    const recessiveNarrative = {
      ...narrativeStage,
      diseases: [
        {
          ...narrativeDisease,
          inheritancePattern: 'autosomalRecessive',
        },
      ],
    } as unknown as Stage;
    const laterFamilyStage = {
      ...familyStage,
      id: 'later-family-stage',
      label: 'Later family',
    } as unknown as Stage;
    const { network } = generateNetwork({
      seed: 42,
      codebook,
      stages: [familyStage, recessiveNarrative, laterFamilyStage],
      familyPedigree: {
        scenario: 'none',
        diseaseMode: 'visualization',
        maxNodes: 7,
      },
    });
    const affectedEarlierMembers = network.nodes.filter(
      (node) =>
        node.stageId === familyStage.id &&
        node[entityAttributesProperty].condition === true,
    );

    expect(affectedEarlierMembers).toHaveLength(2);
  });

  it('normalizes a disease introduced only by a later pedigree', () => {
    const laterDiseaseCodebook = structuredClone(codebook);
    const variables = laterDiseaseCodebook.node?.['family-member']?.variables;
    if (!variables) throw new Error('missing family-member variables');
    variables.laterCondition = { name: 'Later condition', type: 'boolean' };
    const laterFamilyStage = {
      ...familyStage,
      id: 'later-family-stage',
      label: 'Later family',
      nominationPrompts: [
        {
          id: 'later-condition',
          text: 'Who has the later condition?',
          variable: 'laterCondition',
        },
      ],
    } as unknown as Stage;

    for (let seed = 1; seed <= 20; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook: laterDiseaseCodebook,
        stages: [familyStage, laterFamilyStage],
        familyPedigree: {
          scenario: 'none',
          diseaseMode: 'none',
          maxNodes: 7,
        },
      });

      expect(
        network.nodes.every(
          (node) => node[entityAttributesProperty].laterCondition === false,
        ),
      ).toBe(true);
    }
  });

  it('accepts a unique value space matching two pedigrees with one reused ego', () => {
    const exactCodebook = structuredClone(codebook);
    const variables = exactCodebook.node?.['family-member']?.variables;
    if (!variables) throw new Error('missing family-member variables');
    variables.generationMarker = {
      name: 'Generation marker',
      type: 'ordinal',
      options: Array.from({ length: 13 }, (_, index) => ({
        label: `Generation ${String(index + 1)}`,
        value: index + 1,
      })),
      validation: { unique: true },
    };
    const laterFamilyStage = {
      ...familyStage,
      id: 'later-family-stage',
      label: 'Later family',
    } as unknown as Stage;

    const { network } = generateNetwork({
      seed: 42,
      codebook: exactCodebook,
      stages: [familyStage, laterFamilyStage],
      familyPedigree: {
        scenario: 'none',
        diseaseMode: 'none',
        maxNodes: 7,
      },
    });
    const values = network.nodes.map(
      (node) => node[entityAttributesProperty].generationMarker,
    );

    expect(values).toHaveLength(13);
    expect(new Set(values).size).toBe(13);
  });

  it('uses the attainable forced-scenario ceiling during feasibility', () => {
    const exactCodebook = structuredClone(codebook);
    const variables = exactCodebook.node?.['family-member']?.variables;
    if (!variables) throw new Error('missing family-member variables');
    variables.generationMarker = {
      name: 'Generation marker',
      type: 'ordinal',
      options: Array.from({ length: 7 }, (_, index) => ({
        label: `Generation ${String(index + 1)}`,
        value: index + 1,
      })),
      validation: { unique: true },
    };

    const { network } = generateNetwork({
      seed: 42,
      codebook: exactCodebook,
      stages: [familyStage, narrativeStage],
      familyPedigree: { scenario: 'none', maxNodes: 7 },
    });
    const values = network.nodes.map(
      (node) => node[entityAttributesProperty].generationMarker,
    );

    expect(values).toHaveLength(7);
    expect(new Set(values).size).toBe(7);
  });

  it('ignores unreachable Narrative diseases during materialization', () => {
    const exactCodebook = structuredClone(codebook);
    const variables = exactCodebook.node?.['family-member']?.variables;
    if (!variables) throw new Error('missing family-member variables');
    variables.generationMarker = {
      name: 'Generation marker',
      type: 'ordinal',
      options: Array.from({ length: 7 }, (_, index) => ({
        label: `Generation ${String(index + 1)}`,
        value: index + 1,
      })),
      validation: { unique: true },
    };
    const unreachableNarrative = {
      ...narrativeStage,
      diseases: [
        {
          ...narrativeDisease,
          inheritancePattern: 'xLinkedRecessive',
        },
      ],
      skipLogic: {
        action: 'SKIP',
        filter: {
          rules: [
            {
              id: 'missing-consent',
              type: 'ego',
              options: {
                attribute: asEntityAttributeReference('consent'),
                operator: 'NOT_EXISTS',
              },
            },
          ],
        },
      },
    } as unknown as Stage;

    const { network } = generateNetwork({
      seed: 42,
      codebook: exactCodebook,
      stages: [familyStage, unreachableNarrative],
      respectSkipLogicAndFiltering: true,
      familyPedigree: {
        population: {
          ...US_FAMILY_PEDIGREE_POPULATION,
          femaleAtBirthProbability: 1,
        },
        scenario: 'none',
        maxNodes: 7,
      },
    });

    expect(network.nodes).toHaveLength(7);
  });

  it('does not add disease-only relatives when disease planting is disabled', () => {
    const exactCodebook = structuredClone(codebook);
    const variables = exactCodebook.node?.['family-member']?.variables;
    if (!variables) throw new Error('missing family-member variables');
    variables.generationMarker = {
      name: 'Generation marker',
      type: 'ordinal',
      options: Array.from({ length: 7 }, (_, index) => ({
        label: `Generation ${String(index + 1)}`,
        value: index + 1,
      })),
      validation: { unique: true },
    };
    const xLinkedNarrative = {
      ...narrativeStage,
      diseases: [
        {
          ...narrativeDisease,
          inheritancePattern: 'xLinkedRecessive',
        },
      ],
    } as unknown as Stage;

    const { network } = generateNetwork({
      seed: 42,
      codebook: exactCodebook,
      stages: [familyStage, xLinkedNarrative],
      familyPedigree: {
        population: {
          ...US_FAMILY_PEDIGREE_POPULATION,
          femaleAtBirthProbability: 1,
        },
        scenario: 'none',
        diseaseMode: 'none',
        maxNodes: 7,
      },
    });

    expect(network.nodes).toHaveLength(7);
  });

  it.each([
    ['adoption', 'adoptive'],
    ['donorConception', 'donor'],
    ['surrogacy', 'surrogate'],
  ] as const)('materializes the forced %s scenario', (scenario, edgeType) => {
    const { network } = family(17, scenario);
    expect(network.edges.some((edge) => relation(edge) === edgeType)).toBe(
      true,
    );
  });

  it('is reproducible without sharing the ordinary stage random stream', () => {
    const ordinaryStage = {
      id: 'ordinary',
      type: 'NameGenerator',
      label: 'People',
      subject: { entity: 'node', type: 'person' },
      prompts: [{ id: 'people', text: 'Name people' }],
      behaviours: { minNodes: 4, maxNodes: 4 },
    } as unknown as Stage;

    const onlyOrdinary = generateNetwork({
      seed: 91,
      codebook,
      stages: [ordinaryStage],
    }).network.nodes.map((node) => node[entityAttributesProperty]);
    const afterFamily = generateNetwork({
      seed: 91,
      codebook,
      stages: [familyStage, ordinaryStage],
      familyPedigree: { scenario: 'surrogacy' },
    })
      .network.nodes.filter((node) => node.type === 'person')
      .map((node) => node[entityAttributesProperty]);
    expect(afterFamily).toEqual(onlyOrdinary);

    const first = family(91, 'adoption').network;
    const second = family(91, 'adoption').network;
    expect(withoutUids(first.nodes, first.edges)).toEqual(
      withoutUids(second.nodes, second.edges),
    );

    const afterOrdinary = generateNetwork({
      seed: 91,
      codebook,
      stages: [ordinaryStage, familyStage, narrativeStage],
      familyPedigree: { scenario: 'adoption' },
    }).network;
    expect(
      withoutUids(
        afterOrdinary.nodes.filter((node) => node.type === 'family-member'),
        afterOrdinary.edges.filter((edge) => edge.type === 'family-edge'),
      ),
    ).toEqual(withoutUids(first.nodes, first.edges));
  });
});
