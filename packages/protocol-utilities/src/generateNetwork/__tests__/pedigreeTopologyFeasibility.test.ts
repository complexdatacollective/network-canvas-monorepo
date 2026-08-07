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
