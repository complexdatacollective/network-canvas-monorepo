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
    'rejects an open $label count whose mean sits below minNodes',
    ({ count }) => {
      // The missing floor is filled from minNodes, which leaves the mean
      // outside the count's own bounds — every draw would clamp to 30.
      const result = ProtocolSchemaV8.safeParse(
        protocolWith(disjointStage({ minNodes: 30 }, count)),
      );

      expect(result.success).toBe(false);
      expect(result.error?.issues).toContainEqual(
        expect.objectContaining({
          path: expect.arrayContaining(['synthetic', 'count', 'mean']),
          message: expect.stringContaining('lies below the 30 nodes'),
        }),
      );
    },
  );

  it.each([
    {
      label: 'zero-variance normal',
      behaviours: { minNodes: 5 },
      count: { distribution: 'normal', mean: 4, sd: 0, max: 20 },
      floor: 4,
    },
    {
      label: 'zero-mean Poisson',
      behaviours: { minNodes: 1 },
      count: { distribution: 'poisson', mean: 0, max: 20 },
      floor: 0,
    },
  ])(
    'judges a $label against its single-point support, not its explicit max',
    ({ behaviours, count, floor }) => {
      const result = ProtocolSchemaV8.safeParse(
        protocolWith(disjointStage(behaviours, count)),
      );

      expect(result.success).toBe(false);
      expect(result.error?.issues).toContainEqual(
        expect.objectContaining({
          path: expect.arrayContaining(['synthetic', 'count']),
          message: expect.stringContaining(`can draw as few as ${floor}`),
        }),
      );
    },
  );

  // Containment, not overlap: a count that can merely LAND in the window is
  // refused, because generation takes a declared count at face value rather
  // than clamping overshooting draws onto the boundary.
  describe('containment', () => {
    it('rejects a uniform count that straddles maxNodes', () => {
      const result = ProtocolSchemaV8.safeParse(
        protocolWith(
          disjointStage(
            { maxNodes: 3 },
            { distribution: 'uniform', min: 1, max: 20 },
          ),
        ),
      );

      expect(result.success).toBe(false);
      expect(result.error?.issues).toContainEqual(
        expect.objectContaining({
          path: expect.arrayContaining(['synthetic', 'count']),
          message: expect.stringContaining('can draw up to 20'),
        }),
      );
    });

    it('rejects a uniform count that straddles minNodes', () => {
      const result = ProtocolSchemaV8.safeParse(
        protocolWith(
          disjointStage(
            { minNodes: 8 },
            { distribution: 'uniform', min: 0, max: 20 },
          ),
        ),
      );

      expect(result.success).toBe(false);
      expect(result.error?.issues).toContainEqual(
        expect.objectContaining({
          message: expect.stringContaining('can draw as few as 0'),
        }),
      );
    });

    it('bounds an open-tailed family from the window rather than refusing it', () => {
      const result = ProtocolSchemaV8.safeParse(
        protocolWith(
          disjointStage({ maxNodes: 5 }, { distribution: 'poisson', mean: 2 }),
        ),
      );

      expect(result.error?.issues ?? []).toEqual([]);
      expect(
        result.success
          ? (result.data.stages[0] as { synthetic: { count: unknown } })
              .synthetic.count
          : undefined,
      ).toEqual({ distribution: 'poisson', mean: 2, min: 0, max: 5 });
    });

    it('rejects a declared bound the window contradicts', () => {
      // Filling an absent bound is help; overwriting a declared one would be
      // guesswork, so the two conflicting statements are reported instead.
      const result = ProtocolSchemaV8.safeParse(
        protocolWith(
          disjointStage(
            { maxNodes: 3 },
            { distribution: 'poisson', mean: 2, max: 20 },
          ),
        ),
      );

      expect(result.success).toBe(false);
      expect(result.error?.issues).toContainEqual(
        expect.objectContaining({
          message: expect.stringContaining('can draw up to 20'),
        }),
      );
    });

    it('accepts a count contained in the window', () => {
      const result = ProtocolSchemaV8.safeParse(
        protocolWith(
          disjointStage(
            { minNodes: 2, maxNodes: 6 },
            { distribution: 'uniform', min: 2, max: 6 },
          ),
        ),
      );

      expect(result.error?.issues ?? []).toEqual([]);
    });
  });
});

describe('a minNodes gate above the population ceiling', () => {
  const gatedStage = (synthetic?: Record<string, unknown>): Loose => ({
    id: 'stage-1',
    type: 'NameGenerator',
    label: 'Name generator',
    subject: { entity: 'node', type: 'person' },
    form: {
      title: 'Add a person',
      fields: [{ variable: 'name', prompt: 'Name' }],
    },
    prompts: [{ id: 'p1', text: 'Name people' }],
    behaviours: { minNodes: 150 },
    ...(synthetic ? { synthetic } : {}),
  });

  it('keeps a protocol with no synthetic block valid', () => {
    // Such a stage was valid before generation parameters existed: the
    // interface caps nothing at the population ceiling, only generation
    // does. The derived count clamps to the ceiling and the containment rule
    // stands aside — the refusal belongs to the feasibility gate, which
    // names the generation limit instead of invalidating the document.
    const result = ProtocolSchemaV8.safeParse(protocolWith(gatedStage()));
    expect(result.success).toBe(true);
  });

  it('leaves an authored count alone too: no count can reach the gate', () => {
    const result = ProtocolSchemaV8.safeParse(
      protocolWith(
        gatedStage({ count: { distribution: 'constant', value: 50 } }),
      ),
    );
    expect(result.success).toBe(true);
  });

  it('still holds authored counts to a reachable minNodes', () => {
    const result = ProtocolSchemaV8.safeParse(
      protocolWith(
        disjointStage(
          { minNodes: 90 },
          { distribution: 'constant', value: 50 },
        ),
      ),
    );
    expect(result.success).toBe(false);
  });
});

describe('a burden-only synthetic block on a name generator', () => {
  it('derives the omitted count instead of refusing the block', () => {
    const result = ProtocolSchemaV8.safeParse(
      protocolWith({
        id: 'stage-1',
        type: 'NameGenerator',
        label: 'Name generator',
        subject: { entity: 'node', type: 'person' },
        form: {
          title: 'Add a person',
          fields: [{ variable: 'name', prompt: 'Name' }],
        },
        prompts: [{ id: 'p1', text: 'Name people' }],
        synthetic: { responseBurden: 0.9 },
      }),
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    const stage = result.data.stages[0] as {
      synthetic: { responseBurden: number; count?: { distribution: string } };
    };
    expect(stage.synthetic.responseBurden).toBe(0.9);
    // The sibling-aware transform supplies the count the author omitted.
    expect(stage.synthetic.count?.distribution).toBe('normal');
  });
});
