import { describe, expect, it } from 'vitest';

import type { Stage, StructuralCodebook } from '@codaco/protocol-validation';
import {
  BIOLOGICAL_SEX_OPTIONS,
  RELATIONSHIP_TYPE_OPTIONS,
} from '@codaco/shared-consts';

import { generateNetwork } from '../../generateNetwork';

/**
 * A pedigree's people never pass through the stage-creation accounting that
 * builds `effectivePopulation`, so the topology ceiling for a type it builds
 * has to come from the pedigree itself. Reading the declared count instead
 * under-counts, and under-counting is the direction that matters: a ceiling
 * below the pairs the run really makes hides them from the value-space check,
 * and a `unique` edge variable can clear preflight and then run out of values
 * with the session half-built.
 */

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
  },
  framing: { mode: 'fixed', value: 'gamete' },
  boundaries: {
    requireGrandparents: 'required',
    requireChildrenContributors: 'off',
  },
  censusPrompt: 'Build your family.',
} as unknown as Stage;

const codebookWith = (uniqueTie: boolean) =>
  ({
    node: {
      'family-member': {
        name: 'Family member',
        color: 'node-color-seq-1',
        // Smaller than the seven-person core the generator always builds.
        synthetic: { count: { distribution: 'constant', value: 1 } },
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
      'acquaintance': {
        name: 'Acquaintance',
        color: 'edge-color-seq-2',
        synthetic: {
          topology: {
            metric: 'density',
            distribution: { distribution: 'constant', value: 1 },
          },
        },
        variables: {
          // Two values, against a pair count the ceiling must not hide.
          tie: {
            name: 'Tie',
            type: 'boolean',
            ...(uniqueTie ? { validation: { unique: true } } : {}),
          },
        },
      },
    },
  }) as unknown as StructuralCodebook;

describe('a census over the edge type a pedigree already built', () => {
  it('counts the family links as membership rather than negatives', () => {
    // The pedigree draws its links during the walk, after the plan-derived
    // membership map was seeded. Unmerged, the census reported every existing
    // family pair as an explicit negative nomination beside an edge the
    // finished session actually holds.
    const census = {
      id: 'family-census',
      type: 'DyadCensus',
      label: 'Related?',
      subject: { entity: 'node', type: 'family-member' },
      prompts: [
        {
          id: 'fc-p',
          text: 'Are these two related?',
          createEdge: 'family-edge',
        },
      ],
    } as unknown as Stage;

    const { network, stageMetadata } = generateNetwork({
      seed: 1,
      codebook: codebookWith(false),
      stages: [familyStage, census],
    });

    const linked = new Set(
      network.edges
        .filter((edge) => edge.type === 'family-edge')
        .map((edge) => [edge.from, edge.to].toSorted().join('|')),
    );
    expect(linked.size).toBeGreaterThan(0);

    const tuples = (stageMetadata?.['1'] ?? []) as [
      number,
      string,
      string,
      boolean,
    ][];
    expect(tuples.length).toBeGreaterThan(0);

    for (const [, a, b, answer] of tuples) {
      const pair = [a, b].toSorted().join('|');
      // Every pair the network really links must be answered "yes".
      if (linked.has(pair)) expect(answer).toBe(true);
    }
    // And at least one of them is a link the pedigree made.
    expect(
      tuples.some(
        ([, a, b, answer]) => answer && linked.has([a, b].toSorted().join('|')),
      ),
    ).toBe(true);
  });
});
