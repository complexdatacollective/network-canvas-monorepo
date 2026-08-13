import { describe, expect, it } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';
import { entityAttributesProperty, type NcNode } from '@codaco/shared-consts';

import { generateNetwork } from '../../generateNetwork';

type Codebook = Parameters<typeof generateNetwork>[0]['codebook'];

const NUL = '\u0000';

/**
 * Two distinct equality groups whose sorted-member NUL join collides:
 * {a, b<NUL>c} and {a<NUL>b, c} both join to 'a<NUL>b<NUL>c'. Each group has
 * one member declaring unique. The unique-value registry must keep the two
 * groups' used-value pools separate: with 2 nodes and boolean domains, each
 * group can issue {true, false} across the nodes independently.
 */
const A = 'a';
const BC = `b${NUL}c`;
const AB = `a${NUL}b`;
const C = 'c';

const variables: Record<string, unknown> = {
  [A]: { name: 'VarA', type: 'boolean', validation: { unique: true } },
  [BC]: { name: 'VarBC', type: 'boolean', validation: { sameAs: A } },
  [AB]: { name: 'VarAB', type: 'boolean', validation: { unique: true } },
  [C]: { name: 'VarC', type: 'boolean', validation: { sameAs: AB } },
};

const codebook = {
  node: {
    person: {
      color: 'node-color-seq-1',
      variables,
    },
  },
} as unknown as Codebook;

const stages: Stage[] = [
  {
    id: 'stage-1',
    type: 'NameGenerator',
    label: 'Name generator',
    subject: { entity: 'node', type: 'person' },
    form: {
      title: 'Add a person',
      fields: Object.keys(variables).map((variable) => ({
        variable,
        prompt: 'Q',
      })),
    },
    prompts: [{ id: 'p1', text: 'Name people' }],
    behaviours: { minNodes: 2, maxNodes: 2 },
  } as unknown as Stage,
];

describe('unique registry slots for NUL-colliding equality groups', () => {
  it('keeps two colliding groups on independent value pools', () => {
    const { network } = generateNetwork({ seed: 1, codebook, stages });

    const nodes = network.nodes as NcNode[];
    expect(nodes).toHaveLength(2);

    const values = (id: string) =>
      nodes.map((node) => node[entityAttributesProperty][id]);

    // Each group holds its pair equal on every node.
    for (const node of nodes) {
      const attrs = node[entityAttributesProperty];
      expect(attrs[BC]).toBe(attrs[A]);
      expect(attrs[C]).toBe(attrs[AB]);
    }

    // Each unique variable independently issues both boolean values across
    // the two nodes.
    expect(new Set(values(A)).size).toBe(2);
    expect(new Set(values(AB)).size).toBe(2);
  });
});
