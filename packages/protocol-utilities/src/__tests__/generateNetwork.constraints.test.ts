import { describe, expect, it } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';
import { entityAttributesProperty } from '@codaco/shared-consts';

import { generateNetwork } from '../generateNetwork';
import { SyntheticDataConstraintError } from '../generateNetwork/constraints/feasibility';

type Codebook = Parameters<typeof generateNetwork>[0]['codebook'];

const nameGeneratorStage = {
  id: 'stage-1',
  type: 'NameGenerator',
  label: 'Name generator',
  subject: { entity: 'node', type: 'person' },
  prompts: [{ id: 'p1', text: 'Name people' }],
  behaviours: { minNodes: 5, maxNodes: 5 },
} as unknown as Stage;

const egoFormStage = {
  id: 'stage-ego',
  type: 'EgoForm',
  label: 'About you',
  form: {
    fields: [
      { variable: 'a', prompt: 'A' },
      { variable: 'b', prompt: 'B' },
    ],
  },
} as unknown as Stage;

/** A person node type carrying the given variables, as `person`. */
function personCodebook(variables: Record<string, unknown>): Codebook {
  return {
    node: {
      person: {
        color: 'node-color-seq-1',
        variables,
      },
    },
  } as unknown as Codebook;
}

describe('generateNetwork constraint conformance', () => {
  it('holds two ego variables equal when one declares sameAs the other', () => {
    const { network } = generateNetwork({
      seed: 3,
      codebook: {
        ego: {
          variables: {
            a: {
              name: 'A',
              type: 'text',
              validation: { required: true, minLength: 24, maxLength: 24 },
            },
            b: {
              name: 'B',
              type: 'text',
              validation: {
                required: true,
                minLength: 24,
                maxLength: 24,
                sameAs: 'a',
              },
            },
          },
        },
      } as unknown as Codebook,
      stages: [egoFormStage],
    });

    const ego = network.ego?.[entityAttributesProperty] ?? {};
    expect(String(ego.a)).toHaveLength(24);
    expect(ego.b).toBe(ego.a);
  });

  it('issues a distinct value to every node of a unique variable', () => {
    const { network } = generateNetwork({
      seed: 3,
      codebook: personCodebook({
        code: {
          name: 'Code',
          type: 'text',
          validation: { unique: true, minLength: 4, maxLength: 4 },
        },
      }),
      stages: [nameGeneratorStage],
    });

    const codes = network.nodes.map(
      (node) => node[entityAttributesProperty].code,
    );
    expect(codes).toHaveLength(5);
    expect(codes.every((code) => String(code).length === 4)).toBe(true);
    expect(new Set(codes).size).toBe(5);
  });

  it('throws before generating when a protocol is unsatisfiable', () => {
    expect(() =>
      generateNetwork({
        seed: 3,
        codebook: personCodebook({
          code: {
            name: 'Code',
            type: 'text',
            validation: { minLength: 24, maxLength: 10 },
          },
        }),
        stages: [nameGeneratorStage],
      }),
    ).toThrow(SyntheticDataConstraintError);
  });

  it('throws identically regardless of seed', () => {
    const build = (seed: number) => () =>
      generateNetwork({
        seed,
        codebook: personCodebook({
          band: {
            name: 'Band',
            type: 'ordinal',
            options: [
              { label: 'A', value: 1 },
              { label: 'B', value: 2 },
            ],
            validation: { unique: true },
          },
        }),
        stages: [nameGeneratorStage],
      });

    for (const seed of [1, 2, 3, 4, 5]) {
      expect(build(seed)).toThrow(SyntheticDataConstraintError);
    }
  });

  it('keeps AlterForm regeneration consistent with untouched attributes', () => {
    const { network } = generateNetwork({
      seed: 3,
      codebook: personCodebook({
        low: {
          name: 'Low',
          type: 'number',
          validation: { minValue: 0, maxValue: 50 },
        },
        high: {
          name: 'High',
          type: 'number',
          validation: {
            minValue: 0,
            maxValue: 100,
            greaterThanVariable: 'low',
          },
        },
      }),
      stages: [
        nameGeneratorStage,
        {
          id: 'stage-alter',
          type: 'AlterForm',
          label: 'Alter form',
          subject: { entity: 'node', type: 'person' },
          form: { fields: [{ variable: 'high', prompt: 'High' }] },
        } as unknown as Stage,
      ],
    });

    expect(network.nodes).toHaveLength(5);
    for (const node of network.nodes) {
      const attrs = node[entityAttributesProperty];
      expect(Number(attrs.high)).toBeGreaterThan(Number(attrs.low));
    }
  });

  // The DatePicker writes `YYYY` from its year select, `YYYY-MM` from its
  // year/month pair and `YYYY-MM-DD` from its `type="date"` input; the
  // RelativeDatePicker writes `YYYY-MM-DD`. A value at any other resolution
  // fails the min/max validators, which compare these strings lexically.
  it.each([
    { type: undefined, pattern: /^\d{4}-\d{2}-\d{2}$/, label: 'full' },
    { type: 'month', pattern: /^\d{4}-\d{2}$/, label: 'month' },
    { type: 'year', pattern: /^\d{4}$/, label: 'year' },
  ])(
    'emits a $label date at the resolution its picker writes',
    ({ type, pattern }) => {
      const { network } = generateNetwork({
        seed: 3,
        codebook: personCodebook({
          born: {
            name: 'Born',
            type: 'datetime',
            component: 'DatePicker',
            ...(type !== undefined ? { parameters: { type } } : {}),
          },
        }),
        stages: [nameGeneratorStage],
      });

      expect(network.nodes).toHaveLength(5);
      for (const node of network.nodes) {
        expect(node[entityAttributesProperty].born).toMatch(pattern);
      }
    },
  );

  it('keeps a RelativeDatePicker value inside its default window', () => {
    const today = new Date().toISOString().slice(0, 10);
    const { network } = generateNetwork({
      seed: 3,
      config: { today },
      codebook: personCodebook({
        seen: {
          name: 'Seen',
          type: 'datetime',
          component: 'RelativeDatePicker',
        },
      }),
      stages: [nameGeneratorStage],
    });

    // RelativeDatePicker defaults to 180 days before the anchor and none after,
    // which useProtocolForm turns into hard min/max validators.
    const earliest = new Date(Date.parse(`${today}T00:00:00Z`));
    earliest.setUTCDate(earliest.getUTCDate() - 180);
    const min = earliest.toISOString().slice(0, 10);

    for (const node of network.nodes) {
      const seen = String(node[entityAttributesProperty].seen);
      expect(seen >= min && seen <= today).toBe(true);
    }
  });

  it('satisfies an edge comparison rule regenerated by AlterEdgeForm', () => {
    const { network } = generateNetwork({
      seed: 5,
      codebook: {
        node: {
          person: { color: 'node-color-seq-1', variables: {} },
        },
        edge: {
          knows: {
            color: 'edge-color-seq-1',
            variables: {
              since: {
                name: 'Since',
                type: 'number',
                validation: { minValue: 1980, maxValue: 2000 },
              },
              until: {
                name: 'Until',
                type: 'number',
                validation: {
                  minValue: 1980,
                  maxValue: 2020,
                  greaterThanVariable: 'since',
                },
              },
            },
          },
        },
      } as unknown as Codebook,
      stages: [
        nameGeneratorStage,
        {
          id: 'stage-dyad',
          type: 'DyadCensus',
          label: 'Dyad census',
          subject: { entity: 'node', type: 'person' },
          prompts: [{ id: 'p-dyad', text: 'Know?', createEdge: 'knows' }],
        } as unknown as Stage,
        {
          id: 'stage-alter-edge',
          type: 'AlterEdgeForm',
          label: 'Alter edge form',
          subject: { entity: 'edge', type: 'knows' },
          form: { fields: [{ variable: 'until', prompt: 'Until' }] },
        } as unknown as Stage,
      ],
    });

    expect(network.edges.length).toBeGreaterThan(0);
    for (const edge of network.edges) {
      const attrs = edge[entityAttributesProperty];
      expect(Number(attrs.until)).toBeGreaterThan(Number(attrs.since));
    }
  });
});
