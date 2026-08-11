import { describe, expect, it } from 'vitest';

import type { Stage, StructuralCodebook } from '@codaco/protocol-validation';
import {
  BIOLOGICAL_SEX_OPTIONS,
  entityAttributesProperty,
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

/** A census over the family, linking every pair it can. */
const censusStage = {
  id: 'census-stage',
  type: 'DyadCensus',
  // Every eligible pair linked, declared by the stage that pairs them.
  synthetic: {
    topology: {
      metric: 'density',
      distribution: { distribution: 'constant', value: 1 },
    },
  },
  label: 'Who knows whom',
  subject: { entity: 'node', type: 'family-member' },
  prompts: [
    {
      id: 'census-p',
      text: 'Do these two know each other?',
      createEdge: 'acquaintance',
    },
  ],
} as unknown as Stage;

const codebookWith = (uniqueTie: boolean) =>
  ({
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
      'acquaintance': {
        name: 'Acquaintance',
        color: 'edge-color-seq-2',
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

/** An ordinary generator adding people of the pedigree's own node type. */
const ordinaryGenerator = {
  id: 'ng-extra',
  type: 'NameGeneratorQuickAdd',
  label: 'Others',
  subject: { entity: 'node', type: 'family-member' },
  // Exactly one, so the pair arithmetic below is the family's plus this one.
  synthetic: { count: { distribution: 'constant', value: 1 } },
  quickAdd: 'name',
  prompts: [{ id: 'ng-extra-p', text: 'Who else?' }],
} as unknown as Stage;

const censusWithTie = {
  ...censusStage,
  prompts: [
    {
      id: 'census-p',
      text: 'Do these two know each other?',
      createEdge: 'acquaintance',
      edgeVariable: 'tie',
    },
  ],
} as unknown as Stage;

/** A tie-strength census: the census stage that really writes an edge value. */
const rankingCensus = {
  id: 'census-stage',
  type: 'TieStrengthCensus',
  label: 'How close',
  subject: { entity: 'node', type: 'family-member' },
  // Every eligible pair, so the ceiling under test is the pair count itself
  // rather than a fraction of it.
  synthetic: {
    topology: {
      metric: 'density',
      distribution: { distribution: 'constant', value: 1 },
    },
  },
  prompts: [
    {
      id: 'census-p',
      text: 'How close are these two?',
      createEdge: 'acquaintance',
      edgeVariable: 'rank',
      negativeLabel: 'Not at all',
    },
  ],
} as unknown as Stage;

/** The same codebook, with a `unique` ordinal of the given size on the edge. */
const codebookRanking = (options: number) => {
  const base = codebookWith(false) as unknown as {
    edge: Record<string, { variables: Record<string, unknown> }>;
  };
  base.edge.acquaintance!.variables.rank = {
    name: 'Rank',
    type: 'ordinal',
    component: 'RadioGroup',
    options: Array.from({ length: options }, (_, index) => ({
      label: `Rank ${index + 1}`,
      value: index + 1,
    })),
    validation: { unique: true },
  };
  return base as unknown as StructuralCodebook;
};

describe('a census over a type an ordinary stage and a pedigree both build', () => {
  // `materializeFamilyPedigree` APPENDS its family to what the plan already
  // built, so one ordinary person beside the seven-person core is eight
  // subjects and 28 pairs. Counting the larger of the two populations instead
  // of their sum said 21, and the gap between them is where a run clears
  // preflight and then dies: a 25-value space fits 21 edges and not 28.
  //
  // The family is held to its core through the CALLER's ceiling, which is the
  // only lever left: nothing in a protocol caps a pedigree, so without this
  // the count would be the engine's own bound on optional branches.
  const coreOnly = { maxNodes: 7 };
  it('refuses a value space the combined population outgrows', () => {
    expect(() =>
      generateNetwork({
        seed: 1,
        codebook: codebookRanking(25),
        stages: [ordinaryGenerator, familyStage, rankingCensus],
        familyPedigree: coreOnly,
      }),
    ).toThrow(/only 25 distinct values are possible, but up to 28/);
  });

  it('accepts a value space that covers every pair', () => {
    const { network } = generateNetwork({
      seed: 1,
      codebook: codebookRanking(28),
      stages: [ordinaryGenerator, familyStage, rankingCensus],
      familyPedigree: coreOnly,
    });

    expect(
      network.nodes.filter((node) => node.type === 'family-member'),
    ).toHaveLength(8);
  });
});

describe('a census over a pedigree-built type', () => {
  it('counts the family the pedigree builds, not the declared count', () => {
    // A boolean holds two values; the family reaches 21 pairs at its core
    // alone. Preflight has to see that and refuse, rather than measure the
    // declared count of one, find no pairs, and wave the protocol through.
    expect(() =>
      generateNetwork({
        seed: 1,
        codebook: codebookWith(true),
        stages: [familyStage, censusWithTie],
      }),
    ).toThrow(/unique/i);
  });

  it('still generates where the topology asks for nothing unique', () => {
    const { network } = generateNetwork({
      seed: 1,
      codebook: codebookWith(false),
      stages: [familyStage, censusWithTie],
    });

    const family = network.nodes.filter(
      (node) => node.type === 'family-member',
    );
    expect(family.length).toBeGreaterThanOrEqual(7);
    for (const node of family) {
      expect(node[entityAttributesProperty]).toBeDefined();
    }
  });
});
