import { describe, expect, it } from 'vitest';

import type { Stage, StructuralCodebook } from '@codaco/protocol-validation';
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

const narrativeStage = {
  id: 'narrative-stage',
  type: 'NarrativePedigree',
  label: 'Disease',
  sourceStageId: familyStage.id,
  showAtRiskStatuses: true,
  diseases: [
    {
      id: 'condition',
      label: 'Condition',
      color: '#cc0000',
      variable: 'condition',
      inheritancePattern: 'autosomalDominant',
    },
  ],
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
  });
});
