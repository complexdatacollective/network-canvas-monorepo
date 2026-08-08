import { describe, expect, it } from 'vitest';

import type { Stage, StructuralCodebook } from '@codaco/protocol-validation';
import {
  BIOLOGICAL_SEX_OPTIONS,
  RELATIONSHIP_TYPE_OPTIONS,
} from '@codaco/shared-consts';

import { generateNetwork } from '../../generateNetwork';

/**
 * Two pedigrees over different node types, one declared tightly and one left
 * open. A single ceiling maximised across the protocol let the tight type grow
 * to the open one's cap, while per-type feasibility still counted the declared
 * figure — an under-count, which is what lets a run exhaust a value space
 * preflight had already accepted.
 */

const personVariables = {
  name: { name: 'Name', type: 'text' },
  isEgo: { name: 'Is ego', type: 'boolean' },
  relationship: { name: 'Relationship', type: 'text' },
  biologicalSex: {
    name: 'Biological sex',
    type: 'categorical',
    options: BIOLOGICAL_SEX_OPTIONS,
  },
};

const codebook = {
  node: {
    tight: {
      name: 'Tight family',
      color: 'node-color-seq-1',
      // The generator always builds its seven-person core, and nothing more.
      synthetic: { count: { distribution: 'constant', value: 7 } },
      variables: personVariables,
    },
    open: {
      name: 'Open family',
      color: 'node-color-seq-2',
      synthetic: { count: { distribution: 'constant', value: 30 } },
      variables: personVariables,
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

const pedigree = (id: string, type: string): Stage =>
  ({
    id,
    type: 'FamilyPedigree',
    label: id,
    nodeConfig: {
      type,
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
  }) as unknown as Stage;

describe('two pedigrees over differently-sized node types', () => {
  it('holds the tight type to its own declared count', () => {
    const { network } = generateNetwork({
      seed: 3,
      codebook,
      stages: [pedigree('ped-tight', 'tight'), pedigree('ped-open', 'open')],
    });

    const tight = network.nodes.filter((node) => node.type === 'tight');
    const open = network.nodes.filter((node) => node.type === 'open');

    // Its own ceiling, not the other type's.
    expect(tight.length).toBeLessThanOrEqual(7);
    expect(tight.length).toBeGreaterThanOrEqual(7);
    // The open type is free to grow past it.
    expect(open.length).toBeGreaterThan(7);
  });
});

describe('a caller cap above the declared count', () => {
  it('is counted by feasibility, not just honoured by the build', () => {
    // `maxNodes: 30` raises what the materialiser builds past the declared 7.
    // Counting the declaration alone let a unique edge value space sized to
    // the smaller family clear preflight and then run out during the walk.
    const census = {
      id: 'census',
      type: 'DyadCensus',
      label: 'Related?',
      subject: { entity: 'node', type: 'tight' },
      prompts: [{ id: 'c-p', text: 'Related?', createEdge: 'tie' }],
    } as unknown as Stage;

    const withTie = {
      ...codebook,
      edge: {
        ...(codebook as unknown as { edge: Record<string, unknown> }).edge,
        tie: {
          name: 'Tie',
          color: 'edge-color-seq-2',
          synthetic: {
            topology: {
              metric: 'density',
              distribution: { distribution: 'constant', value: 1 },
            },
          },
          variables: {
            rank: {
              name: 'Rank',
              type: 'ordinal',
              component: 'RadioGroup',
              // Enough for the 21 pairs of a 7-person family, not for a 30.
              options: Array.from({ length: 25 }, (_, index) => ({
                label: `R${index + 1}`,
                value: index + 1,
              })),
              validation: { unique: true },
            },
          },
        },
      },
    } as unknown as StructuralCodebook;

    expect(() =>
      generateNetwork({
        seed: 3,
        codebook: withTie,
        stages: [pedigree('ped-tight', 'tight'), census],
        familyPedigree: { maxNodes: 30 },
      }),
    ).toThrow(/unique/i);
  });
});
