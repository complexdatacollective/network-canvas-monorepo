import { describe, expect, it } from 'vitest';

import type { Stage, StructuralCodebook } from '@codaco/protocol-validation';
import { entityPrimaryKeyProperty, type NcNode } from '@codaco/shared-consts';

import { generateNetwork } from '../../generateNetwork';
import { SyntheticInterview } from '../../SyntheticInterview';

/**
 * Roster rows keep whatever ids the caller's external data carried, and an
 * `_uid` is an arbitrary string. A pair key joined on a space is not injective
 * over those: `('a', 'b c')` and `('a b', 'c')` read alike, so the pair domain
 * loses a real pair and an edge can be attributed to the wrong one.
 */

const rows = [
  { [entityPrimaryKeyProperty]: 'a', type: 'person', attributes: {} },
  { [entityPrimaryKeyProperty]: 'b c', type: 'person', attributes: {} },
  { [entityPrimaryKeyProperty]: 'a b', type: 'person', attributes: {} },
  { [entityPrimaryKeyProperty]: 'c', type: 'person', attributes: {} },
] as unknown as NcNode[];

describe('endpoint ids that contain spaces', () => {
  it('keeps every pair distinct', () => {
    const { network } = generateNetwork({
      seed: 4,
      codebook: {
        node: {
          person: {
            name: 'Person',
            color: 'node-color-seq-1',
            synthetic: { count: { distribution: 'constant', value: 4 } },
            variables: {},
          },
        },
        ego: { variables: {} },
        edge: {
          knows: {
            name: 'Knows',
            color: 'edge-color-seq-1',
            variables: {},
            synthetic: {
              topology: {
                metric: 'density',
                distribution: { distribution: 'constant', value: 1 },
              },
            },
          },
        },
      } as unknown as StructuralCodebook,
      stages: [
        {
          id: 'roster',
          type: 'NameGeneratorRoster',
          label: 'People',
          subject: { entity: 'node', type: 'person' },
          dataSource: 'roster',
          cardOptions: { displayLabel: 'name' },
          prompts: [{ id: 'r-p', text: 'Pick people' }],
        },
        {
          id: 'soc',
          type: 'Sociogram',
          label: 'Link',
          subject: { entity: 'node', type: 'person' },
          background: { concentricCircles: 3, skewedTowardCenter: true },
          behaviours: { freeDraw: true },
          prompts: [{ id: 'soc-p', text: 'Link', edges: { create: 'knows' } }],
        },
      ] as unknown as Stage[],
      externalData: { roster: rows },
    });

    // Density 1 over four people is every one of the six pairs. A key that
    // collides drops one of them.
    expect(network.nodes).toHaveLength(4);
    expect(network.edges.filter((edge) => edge.type === 'knows')).toHaveLength(
      6,
    );
  });
});

describe('synthetic metadata on an ego variable', () => {
  it('is held to the variable type, as node and edge variables are', () => {
    const si = new SyntheticInterview(1);

    expect(() =>
      si.addEgoVariable({
        type: 'number',
        name: 'age',
        synthetic: { generator: 'personName' },
      } as never),
    ).toThrow(/ego/i);
  });

  it('accepts metadata that does match', () => {
    const si = new SyntheticInterview(1);

    expect(() =>
      si.addEgoVariable({
        type: 'number',
        name: 'age',
        synthetic: { distribution: 'normal', mean: 40, sd: 12 },
      } as never),
    ).not.toThrow();
  });
});
