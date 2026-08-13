import { describe, expect, it } from 'vitest';

import ProtocolSchemaV8 from '../schemas/8/schema.ts';

type Loose = Record<string, unknown>;

const codebook = {
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: {
        name: { name: 'Name', type: 'text', component: 'Text' },
      },
    },
  },
};

/** NameGenerator whose behaviours window and synthetic count are disjoint. */
const disjointStage = (
  behaviours: Record<string, number>,
  count: Record<string, unknown>,
): Loose => ({
  id: 'stage-1',
  type: 'NameGenerator',
  label: 'Name generator',
  subject: { entity: 'node', type: 'person' },
  form: {
    title: 'Add a person',
    fields: [{ variable: 'name', prompt: 'Name' }],
  },
  prompts: [{ id: 'p1', text: 'Name people' }],
  behaviours,
  synthetic: { count },
});

const protocolWith = (stage: Loose) => ({
  name: 'Test Protocol',
  schemaVersion: 8 as const,
  codebook,
  stages: [stage],
});

describe('synthetic count vs behaviours window (verify-15)', () => {
  it('rejects a constant count above the same stage maxNodes', () => {
    const result = ProtocolSchemaV8.safeParse(
      protocolWith(
        disjointStage({ maxNodes: 5 }, { distribution: 'constant', value: 20 }),
      ),
    );
    // CORRECT behaviour: a count no session can produce should be refused.
    expect(result.success).toBe(false);
  });

  it('rejects a uniform count range wholly above maxNodes', () => {
    const result = ProtocolSchemaV8.safeParse(
      protocolWith(
        disjointStage(
          { maxNodes: 5 },
          { distribution: 'uniform', min: 10, max: 20 },
        ),
      ),
    );
    expect(result.success).toBe(false);
  });

  it('rejects a constant count below the same stage minNodes', () => {
    const result = ProtocolSchemaV8.safeParse(
      protocolWith(
        disjointStage({ minNodes: 10 }, { distribution: 'constant', value: 2 }),
      ),
    );
    expect(result.success).toBe(false);
  });

  it('accepts a count reachable inside the same stage window', () => {
    const result = ProtocolSchemaV8.safeParse(
      protocolWith(
        disjointStage(
          { minNodes: 1, maxNodes: 5 },
          { distribution: 'constant', value: 3 },
        ),
      ),
    );
    expect(result.success).toBe(true);
  });

  it.each([
    {
      label: 'normal',
      count: { distribution: 'normal', mean: 8, sd: 3 },
    },
    {
      label: 'poisson',
      count: { distribution: 'poisson', mean: 8 },
    },
  ])(
    'rejects an open $label count whose sampler ceiling is below minNodes',
    ({ count }) => {
      const result = ProtocolSchemaV8.safeParse(
        protocolWith(disjointStage({ minNodes: 30 }, count)),
      );

      expect(result.success).toBe(false);
      expect(result.error?.issues).toContainEqual(
        expect.objectContaining({
          path: expect.arrayContaining(['synthetic', 'count']),
          message: expect.stringContaining('can reach at most'),
        }),
      );
    },
  );
});
