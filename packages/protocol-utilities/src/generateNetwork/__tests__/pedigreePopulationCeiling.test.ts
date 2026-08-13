import { describe, expect, it } from 'vitest';

import type { Stage, StructuralCodebook } from '@codaco/protocol-validation';
import { MAX_SYNTHETIC_POPULATION } from '@codaco/protocol-validation';
import {
  BIOLOGICAL_SEX_OPTIONS,
  RELATIONSHIP_TYPE_OPTIONS,
} from '@codaco/shared-consts';

import { generateNetwork } from '../../generateNetwork';
import { US_FAMILY_PEDIGREE_POPULATION } from '../familyPedigree/referencePopulation';

const codebook = {
  node: {
    'family-member': {
      name: 'Family member',
      color: 'node-color-seq-1',
      variables: {
        name: { name: 'Name', type: 'text' },
        isEgo: { name: 'Is ego', type: 'boolean' },
        relationship: { name: 'Relationship', type: 'text' },
        biologicalSex: {
          name: 'Biological sex',
          type: 'categorical',
          options: BIOLOGICAL_SEX_OPTIONS,
        },
      },
    },
  },
  ego: { variables: {} },
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
      },
    },
  },
} as unknown as StructuralCodebook;

const pedigreeStage = {
  id: 'family',
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
  },
  framing: { mode: 'fixed', value: 'gamete' },
  boundaries: {
    requireGrandparents: 'required',
    requireChildrenContributors: 'off',
  },
  censusPrompt: 'Build your family.',
} as unknown as Stage;

describe('family pedigree vs the run-wide synthetic population budget', () => {
  it('a raised pedigree ceiling still keeps the run within MAX_SYNTHETIC_POPULATION', () => {
    const { network } = generateNetwork({
      codebook,
      stages: [pedigreeStage],
      seed: 42,
      familyPedigree: {
        maxNodes: 30_000,
        scenario: 'none',
        diseaseMode: 'none',
        population: {
          ...US_FAMILY_PEDIGREE_POPULATION,
          completedFamilySize: [{ value: 72, weight: 1 }],
        },
      },
    });

    // Every other creation site is clamped to the run-wide budget
    // (deriveFeasibilityConfig walks MAX_SYNTHETIC_POPULATION down across
    // stage creations), and the schema caps declared counts with the message
    // "generation is synchronous, so it is capped at 10000". The pedigree
    // ceiling must honour the same budget.
    expect(network.nodes.length).toBeLessThanOrEqual(MAX_SYNTHETIC_POPULATION);
  });
});
