import { describe, expect, it } from 'vitest';

import ProtocolSchemaV8 from '../schemas/8/schema.ts';
import {
  DEFAULT_NOMINATION_MEAN,
  DEFAULT_NOMINATION_SD,
  DEFAULT_RESPONSE_BURDEN,
} from '../schemas/8/synthetic/index.ts';
import { MAX_SYNTHETIC_POPULATION } from '../shared/synthetic/helpers.ts';

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

const nameGenerator = (stage: Loose = {}): Loose => ({
  id: 'stage-1',
  type: 'NameGenerator',
  label: 'Name generator',
  subject: { entity: 'node', type: 'person' },
  form: {
    title: 'Add a person',
    fields: [{ variable: 'name', prompt: 'Name' }],
  },
  prompts: [{ id: 'p1', text: 'Name people' }],
  ...stage,
});

const protocolWith = (stage: Loose) => ({
  name: 'Test Protocol',
  schemaVersion: 8 as const,
  codebook,
  stages: [stage],
});

/** The count the schema resolved for the protocol's only stage. */
const resolvedCount = (stage: Loose) => {
  const result = ProtocolSchemaV8.safeParse(protocolWith(stage));
  expect(result.error?.issues ?? []).toEqual([]);
  return (
    result.data?.stages[0] as { synthetic?: { count: Record<string, unknown> } }
  )?.synthetic?.count;
};

describe('default synthetic count', () => {
  it('gives a stage that declares none a count of its own', () => {
    // Generation reads `stage.synthetic.count` with no fallback, so parsing
    // has to leave one there.
    expect(resolvedCount(nameGenerator())).toEqual({
      distribution: 'normal',
      mean: DEFAULT_NOMINATION_MEAN,
      sd: DEFAULT_NOMINATION_SD,
      min: 0,
      max: MAX_SYNTHETIC_POPULATION,
    });
  });

  it('leaves a declared count alone', () => {
    expect(
      resolvedCount(
        nameGenerator({
          synthetic: { count: { distribution: 'constant', value: 4 } },
        }),
      ),
    ).toEqual({ distribution: 'constant', value: 4 });
  });

  it.each([
    {
      label: 'the window contains the default mean',
      behaviours: { minNodes: 2, maxNodes: 20 },
      expected: { mean: DEFAULT_NOMINATION_MEAN, min: 2, max: 20 },
    },
    {
      label: 'a cap sits below the default mean',
      behaviours: { maxNodes: 5 },
      // The mean cannot stay at 8 on a stage that caps at 5, so it is pinned
      // to the cap and the truncated draw leans against it.
      expected: { mean: 5, min: 0, max: 5 },
    },
    {
      label: 'a floor sits above the default mean',
      behaviours: { minNodes: 20 },
      expected: { mean: 20, min: 20, max: MAX_SYNTHETIC_POPULATION },
    },
    {
      label: 'the window admits a single value',
      behaviours: { minNodes: 4, maxNodes: 4 },
      expected: { mean: 4, min: 4, max: 4 },
    },
  ])('fits the window when $label', ({ behaviours, expected }) => {
    expect(resolvedCount(nameGenerator({ behaviours }))).toEqual({
      distribution: 'normal',
      sd: DEFAULT_NOMINATION_SD,
      ...expected,
    });
  });

  it('holds the default to the synthetic population cap', () => {
    // `behaviours` bounds what a participant may type and carries no cap of
    // its own; a count is what generation materialises, and does.
    expect(
      resolvedCount(nameGenerator({ behaviours: { maxNodes: 100_000 } })),
    ).toEqual({
      distribution: 'normal',
      mean: DEFAULT_NOMINATION_MEAN,
      sd: DEFAULT_NOMINATION_SD,
      min: 0,
      max: MAX_SYNTHETIC_POPULATION,
    });
  });

  it('defaults every name generator, not just one', () => {
    // The three name generators share the rule; a stage type that silently
    // kept an absent count would break generation's no-fallback contract.
    const quickAdd = nameGenerator({
      id: 'stage-2',
      type: 'NameGeneratorQuickAdd',
      quickAdd: 'name',
      form: undefined,
    });
    delete quickAdd.form;

    const result = ProtocolSchemaV8.safeParse(protocolWith(quickAdd));

    expect(result.error?.issues ?? []).toEqual([]);
    expect(
      result.success
        ? (result.data.stages[0] as { synthetic?: unknown }).synthetic
        : undefined,
    ).toEqual({
      generatesData: true,
      // The count transform rebuilds the descriptor, so the burden the field
      // default would have supplied has to survive that rebuild.
      responseBurden: DEFAULT_RESPONSE_BURDEN.NameGeneratorQuickAdd,
      count: {
        distribution: 'normal',
        mean: DEFAULT_NOMINATION_MEAN,
        sd: DEFAULT_NOMINATION_SD,
        min: 0,
        max: MAX_SYNTHETIC_POPULATION,
      },
    });
  });

  it('produces a default the containment rule would accept', () => {
    // The default is built to fit rather than checked, so this is the property
    // that keeps the two halves honest: whatever window an author sets, the
    // count parsing supplies must sit inside it.
    for (const behaviours of [
      { minNodes: 1, maxNodes: 1 },
      { minNodes: 5, maxNodes: 5 },
      { maxNodes: 1 },
      { minNodes: 12 },
      { minNodes: 2, maxNodes: 40 },
    ]) {
      const count = resolvedCount(nameGenerator({ behaviours })) as {
        mean: number;
        min: number;
        max: number;
      };

      expect(count.min).toBeGreaterThanOrEqual(behaviours.minNodes ?? 0);
      expect(count.max).toBeLessThanOrEqual(
        behaviours.maxNodes ?? Number.POSITIVE_INFINITY,
      );
      expect(count.min).toBeLessThanOrEqual(count.max);
      // requireDrawableCount additionally needs the mean inside the bounds.
      expect(count.mean).toBeGreaterThanOrEqual(count.min);
      expect(count.mean).toBeLessThanOrEqual(count.max);
    }
  });
});
