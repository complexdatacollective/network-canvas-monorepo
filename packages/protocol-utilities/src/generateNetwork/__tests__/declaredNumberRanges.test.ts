import { describe, expect, it } from 'vitest';

import type { Stage, StructuralCodebook } from '@codaco/protocol-validation';
import { entityAttributesProperty } from '@codaco/shared-consts';

import { generateNetwork } from '../../generateNetwork';

/**
 * An unbounded number falls back to a realistic span of ages, 18–80. That span
 * is the DEFAULT DESCRIPTOR's own window — what a variable declaring nothing
 * draws from — and not a rule about the variable. Used as a clamp it silently
 * replaces any declared distribution that lies outside it.
 */

const scoresFor = (
  synthetic: Record<string, unknown>,
  validation?: Record<string, unknown>,
): number[] => {
  const { network } = generateNetwork({
    seed: 5,
    codebook: {
      node: {
        person: {
          name: 'Person',
          color: 'node-color-seq-1',
          synthetic: { count: { distribution: 'constant', value: 6 } },
          variables: {
            score: {
              name: 'Score',
              type: 'number',
              component: 'Number',
              ...(validation ? { validation } : {}),
              synthetic,
            },
          },
        },
      },
      ego: { variables: {} },
      edge: {},
    } as unknown as StructuralCodebook,
    stages: [
      {
        id: 's1',
        type: 'NameGenerator',
        label: 'People',
        subject: { entity: 'node', type: 'person' },
        form: {
          title: 'About this person',
          fields: [{ variable: 'score', prompt: 'Score' }],
        },
        prompts: [{ id: 'p1', text: 'Name people' }],
      },
    ] as unknown as Stage[],
  });

  return network.nodes.map(
    (node) => node[entityAttributesProperty].score as number,
  );
};

describe('a declared number range outside the realism fallback', () => {
  it('draws a uniform over 0–1 rather than clamping to 18', () => {
    const scores = scoresFor({ distribution: 'uniform', min: 0, max: 1 });

    expect(scores).toHaveLength(6);
    for (const score of scores) {
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    }
    // Not all pinned to one end, which is what a clamp produces.
    expect(new Set(scores).size).toBeGreaterThan(1);
  });

  it('lets a normal around zero reach negative values', () => {
    const scores = scoresFor({ distribution: 'normal', mean: 0, sd: 1 });

    expect(scores.some((score) => score < 0)).toBe(true);
  });

  it('still obeys a validation floor the protocol declares', () => {
    // Validation stays authoritative over a target: the descriptor asks for
    // values around zero, the rule forbids them below 10.
    const scores = scoresFor(
      { distribution: 'normal', mean: 0, sd: 1 },
      { minValue: 10, maxValue: 20 },
    );

    for (const score of scores) {
      expect(score).toBeGreaterThanOrEqual(10);
      expect(score).toBeLessThanOrEqual(20);
    }
  });

  it('keeps the 18–80 span where nothing is declared', () => {
    const { network } = generateNetwork({
      seed: 5,
      codebook: {
        node: {
          person: {
            name: 'Person',
            color: 'node-color-seq-1',
            synthetic: { count: { distribution: 'constant', value: 6 } },
            variables: { score: { name: 'Score', type: 'number' } },
          },
        },
        ego: { variables: {} },
        edge: {},
      } as unknown as StructuralCodebook,
      stages: [
        {
          id: 's1',
          type: 'NameGenerator',
          label: 'People',
          subject: { entity: 'node', type: 'person' },
          form: {
            title: 'About this person',
            fields: [{ variable: 'score', prompt: 'Score' }],
          },
          prompts: [{ id: 'p1', text: 'Name people' }],
        },
      ] as unknown as Stage[],
    });

    for (const node of network.nodes) {
      const score = node[entityAttributesProperty].score as number;
      expect(score).toBeGreaterThanOrEqual(18);
      expect(score).toBeLessThanOrEqual(80);
      expect(Number.isInteger(score)).toBe(true);
    }
  });
});

describe('one variable key used in two node types', () => {
  it('resolves each definition separately', () => {
    // Resolution is memoised, and keyed by variable id the first definition
    // answered for both — so the second type's declared metadata was ignored.
    const { network } = generateNetwork({
      seed: 4,
      codebook: {
        node: {
          person: {
            name: 'Person',
            color: 'node-color-seq-1',
            synthetic: { count: { distribution: 'constant', value: 3 } },
            variables: {
              shared: {
                name: 'Shared',
                type: 'number',
                component: 'Number',
                synthetic: { distribution: 'constant', value: 1 },
              },
            },
          },
          org: {
            name: 'Org',
            color: 'node-color-seq-2',
            synthetic: { count: { distribution: 'constant', value: 3 } },
            variables: {
              shared: {
                name: 'Shared',
                type: 'number',
                component: 'Number',
                synthetic: { distribution: 'constant', value: 999 },
              },
            },
          },
        },
        ego: { variables: {} },
        edge: {},
      } as unknown as StructuralCodebook,
      stages: [
        {
          id: 'ng-person',
          type: 'NameGenerator',
          label: 'People',
          subject: { entity: 'node', type: 'person' },
          form: {
            title: 'About',
            fields: [{ variable: 'shared', prompt: 'Shared' }],
          },
          prompts: [{ id: 'p1', text: 'Name people' }],
        },
        {
          id: 'ng-org',
          type: 'NameGenerator',
          label: 'Orgs',
          subject: { entity: 'node', type: 'org' },
          form: {
            title: 'About',
            fields: [{ variable: 'shared', prompt: 'Shared' }],
          },
          prompts: [{ id: 'p2', text: 'Name orgs' }],
        },
      ] as unknown as Stage[],
    });

    const valuesFor = (type: string) =>
      network.nodes
        .filter((node) => node.type === type)
        .map((node) => node[entityAttributesProperty].shared);

    expect(valuesFor('person')).toEqual([1, 1, 1]);
    expect(valuesFor('org')).toEqual([999, 999, 999]);
  });
});
