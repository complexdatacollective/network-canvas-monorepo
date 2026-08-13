import { describe, expect, it } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import { generateNetwork } from '../../generateNetwork';

type Codebook = Parameters<typeof generateNetwork>[0]['codebook'];

const stage = (value: Record<string, unknown>): Stage =>
  value as unknown as Stage;

const codebook = {
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-1',
      variables: {
        name: { name: 'Name', type: 'text' },
        v: { name: 'V', type: 'boolean', synthetic: { probabilityTrue: 1 } },
      },
    },
  },
  edge: {
    X: { name: 'X', color: 'edge-color-seq-1', variables: {} },
  },
  ego: { variables: {} },
} as unknown as Codebook;

const nameGenerator = (id: string): Stage =>
  stage({
    id,
    type: 'NameGeneratorQuickAdd',
    label: id,
    subject: { entity: 'node', type: 'person' },
    quickAdd: 'name',
    prompts: [{ id: `${id}-p1`, text: 'Who?' }],
    behaviours: { minNodes: 2, maxNodes: 2 },
  });

describe('a filtered edge stage after a form that ran before some nodes existed', () => {
  it('links only nodes that actually hold the filtered value in the live session', () => {
    // Stage 0 names two people; stage 1's AlterForm writes `v` (always true)
    // onto exactly those two; stage 2 names two MORE people, after the only
    // writer of `v` has already run. The live session therefore holds
    // v === true on the first two people only, and the stage-3 sociogram's
    // `v EXACTLY true` filter admits just that one pair.
    const stages: Stage[] = [
      nameGenerator('ng-one'),
      stage({
        id: 'form',
        type: 'AlterForm',
        label: 'About them',
        subject: { entity: 'node', type: 'person' },
        form: { fields: [{ variable: 'v', prompt: '?' }] },
      }),
      nameGenerator('ng-two'),
      stage({
        id: 'soc',
        type: 'Sociogram',
        label: 'Links',
        subject: { entity: 'node', type: 'person' },
        synthetic: {
          topology: {
            metric: 'density',
            distribution: { distribution: 'constant', value: 1 },
          },
        },
        filter: {
          join: 'AND',
          rules: [
            {
              id: 'r1',
              type: 'node',
              options: {
                type: 'person',
                attribute: 'v',
                operator: 'EXACTLY',
                value: true,
              },
            },
          ],
        },
        prompts: [{ id: 'soc-p1', text: 'Link', edges: { create: 'X' } }],
      }),
    ];

    const { network } = generateNetwork({
      seed: 5,
      codebook,
      stages,
      respectSkipLogicAndFiltering: true,
    });

    expect(network.nodes).toHaveLength(4);

    const holdsV = (node: NcNode) => node[entityAttributesProperty].v === true;
    const withV = network.nodes.filter(holdsV);
    // Only the two people present when the AlterForm ran ever answered `v`.
    expect(withV).toHaveLength(2);

    const vTrueUids = new Set(
      withV.map((node) => node[entityPrimaryKeyProperty]),
    );
    const xEdges = network.edges.filter((edge) => edge.type === 'X');
    // Every X edge must join nodes the sociogram's own filter admits in the
    // live session: nodes holding v === true.
    for (const edge of xEdges) {
      expect(vTrueUids.has(edge.from as string)).toBe(true);
      expect(vTrueUids.has(edge.to as string)).toBe(true);
    }
    // One eligible pair at density 1 is exactly one edge.
    expect(xEdges).toHaveLength(1);
  });
});
