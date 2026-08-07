import { describe, expect, it } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';
import {
  type DyadCensusMetadataItem,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import { generateNetwork } from '../../generateNetwork';

/**
 * A FamilyPedigree builds its people during the session walk rather than in the
 * plan, so a later census over them has no planned domain and the walk applies
 * the declared topology itself. That fallback has to behave like the plan it
 * stands in for: one target per edge type however many interactions create it,
 * and edges it makes have to reach the census answers that describe them.
 */

type Codebook = Parameters<typeof generateNetwork>[0]['codebook'];

const codebook = (density: number): Codebook =>
  ({
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        synthetic: { count: { distribution: 'constant', value: 8 } },
        variables: {
          name: { name: 'Name', type: 'text' },
          isEgo: { name: 'Is ego', type: 'boolean' },
          relationship: { name: 'Relationship', type: 'text' },
          sex: { name: 'Sex', type: 'text' },
        },
      },
    },
    edge: {
      knows: {
        name: 'Knows',
        color: 'edge-color-seq-1',
        synthetic: {
          topology: {
            metric: 'density',
            distribution: { distribution: 'constant', value: density },
          },
        },
        variables: {},
      },
    },
  }) as unknown as Codebook;

const pedigree = {
  id: 'stage-pedigree',
  type: 'FamilyPedigree',
  label: 'Family',
  nodeConfig: {
    type: 'person',
    nodeLabelVariable: 'name',
    egoVariable: 'isEgo',
    relationshipVariable: 'relationship',
    biologicalSexVariable: 'sex',
  },
  edgeConfig: {
    type: 'relation',
    relationshipTypeVariable: 'relType',
    isActiveVariable: 'isActive',
    isGestationalCarrierVariable: 'carrier',
    gameteRoleVariable: 'gamete',
  },
  framing: { mode: 'fixed', value: 'gendered' },
  boundaries: {
    requireGrandparents: 'off',
    requireChildrenContributors: 'off',
  },
  censusPrompt: 'Add your family.',
} as unknown as Stage;

const census = (promptCount: number): Stage =>
  ({
    id: 'stage-census',
    type: 'DyadCensus',
    label: 'Who knows whom',
    subject: { entity: 'node', type: 'person' },
    prompts: Array.from({ length: promptCount }, (_, index) => ({
      id: `p${index + 1}`,
      text: 'Do they know each other?',
      createEdge: 'knows',
    })),
  }) as unknown as Stage;

const pairKey = (a: string, b: string) => (a < b ? `${a} ${b}` : `${b} ${a}`);

describe('a census over a family the plan could not size', () => {
  it('applies one topology target however many prompts create the edge', () => {
    // Each prompt reaches the fallback. Measuring a fresh target against
    // whatever the previous prompt left unlinked applies the declared density
    // twice — two passes at 0.5 leaving roughly 0.75 — so the count has to be
    // the same whether one interaction creates the type or several.
    for (let seed = 1; seed <= 12; seed++) {
      const options = { seed, codebook: codebook(0.5) };
      const { network: onePrompt } = generateNetwork({
        ...options,
        stages: [pedigree, census(1)],
      });
      const { network: twoPrompts } = generateNetwork({
        ...options,
        stages: [pedigree, census(2)],
      });

      const knows = (network: { edges: { type: string }[] }) =>
        network.edges.filter((edge) => edge.type === 'knows').length;

      expect(knows(twoPrompts)).toBe(knows(onePrompt));
    }
  });

  it('never calls a pair unlinked while carrying an edge between them', () => {
    // Census answers read final membership, which the plan seeds from its own
    // edges. An edge the walk added and did not record there is reported as an
    // explicit negative nomination — a session saying both that these two are
    // linked and that they are not.
    for (let seed = 1; seed <= 12; seed++) {
      const { network, stageMetadata } = generateNetwork({
        seed,
        codebook: codebook(0.5),
        stages: [pedigree, census(1)],
      });

      const linked = new Set(
        network.edges
          .filter((edge) => edge.type === 'knows')
          .map((edge) => pairKey(edge.from, edge.to)),
      );
      const tuples = (stageMetadata?.[1] ?? []) as DyadCensusMetadataItem[];

      expect(network.nodes.length).toBeGreaterThan(1);
      for (const [, a, b, answered] of tuples) {
        if (!answered) expect(linked.has(pairKey(a, b))).toBe(false);
      }
      // And the negatives are actually being exercised, so the assertion above
      // is not vacuous.
      expect(tuples.length).toBeGreaterThan(0);
      expect(
        network.nodes.map((node) => node[entityPrimaryKeyProperty]).length,
      ).toBe(network.nodes.length);
    }
  });
});
