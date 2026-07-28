import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Protocol } from '../../index.ts';
import migrationV7toV8 from '../migration.ts';
import ProtocolSchemaV8 from '../schema.ts';

/**
 * Thirteenth-wave Finding 4: the migration's contradiction-strip fixpoint used
 * to apply exactly ONE contradiction's strips per pass and then re-run the
 * whole analyser, which is quadratic in the number of independent repairs.
 * That finding batched only the two LOCAL contradiction classes (a single
 * variable's own inverted bound pair, or a `minSelected` above its own
 * option count). This generalises batching to every class whose
 * `variableIds` names the FULL set of variables that could change whether it
 * holds — which is every class except `pinnedEqualDifferentFrom` and
 * `disjointBounds` (see `NON_BATCHABLE_CONTRADICTION_CLASSES` in
 * migration.ts for why those two stay one-at-a-time unconditionally).
 * Contradictions that share a variable — whatever their class — are never
 * batched together regardless: the second one is simply deferred to a later
 * pass, where it is re-analysed fresh against the post-strip state.
 *
 * Counting analyser invocations is the timing-free way to see which path ran:
 * N pairwise-independent repairs of a batchable class take 2 analyser runs
 * when batched and N+1 when not.
 */
const { analyser } = vi.hoisted(() => ({ analyser: { calls: 0 } }));

vi.mock('../variables/validation-contradictions.ts', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../variables/validation-contradictions.ts')
    >();
  return {
    ...actual,
    findValidationContradictions: (variables: Record<string, unknown>) => {
      analyser.calls += 1;
      return actual.findValidationContradictions(variables);
    },
  };
});

const migrateVariables = (variables: Record<string, unknown>) => {
  const v7Protocol = {
    schemaVersion: 7 as const,
    codebook: { ego: { variables } },
    stages: [],
  };
  return migrationV7toV8.migrate(v7Protocol as unknown as Protocol<7>, {
    name: 'Test Protocol',
  });
};

describe('migration contradiction-repair batching', () => {
  beforeEach(() => {
    analyser.calls = 0;
  });

  it('repairs many independent inverted-bound variables in a single batched pass', () => {
    const variables: Record<string, unknown> = {};
    for (let index = 0; index < 200; index++) {
      variables[`v${index}`] = {
        name: `v${index}`,
        type: 'number',
        validation: { minValue: 10, maxValue: 2, required: true },
      };
    }

    const migratedRaw = migrateVariables(variables);
    // One pass finds and repairs all 200; the second confirms the fixpoint.
    // Read before parsing — the schema's own refinement runs the (mocked)
    // analyser too.
    expect(analyser.calls).toBe(2);

    const parsed = ProtocolSchemaV8.safeParse(migratedRaw);
    expect(parsed.success).toBe(true);
    const parsedVariables = parsed.data?.codebook.ego?.variables ?? {};
    expect(Object.keys(parsedVariables)).toHaveLength(200);
    for (const variable of Object.values(parsedVariables)) {
      expect(variable).toHaveProperty('validation.required', true);
      expect(variable).not.toHaveProperty('validation.minValue');
      expect(variable).not.toHaveProperty('validation.maxValue');
    }
  });

  it('batches many independent structural repairs (conflictingReferencePair) in a single pass', () => {
    // Two hundred independent `sameAs` + `differentFrom` pairs, each naming
    // one target — a class-7 `conflictingReferencePair` whose `variableIds`
    // is exactly its own {a_i, b_i}. No pair shares a variable with any
    // other, so every one of them is provably independent and belongs in the
    // same batch, unlike a class this file also has to keep one-at-a-time
    // (see the `pinnedEqualDifferentFrom` test below).
    const variables: Record<string, unknown> = {};
    for (let index = 0; index < 200; index++) {
      variables[`a${index}`] = {
        name: `a${index}`,
        type: 'text',
        validation: { sameAs: `b${index}`, differentFrom: `b${index}` },
      };
      variables[`b${index}`] = { name: `b${index}`, type: 'text' };
    }

    const migratedRaw = migrateVariables(variables);
    // One pass batches and repairs all 200 pairs; the second confirms the
    // fixpoint.
    expect(analyser.calls).toBe(2);

    const parsed = ProtocolSchemaV8.safeParse(migratedRaw);
    expect(parsed.success).toBe(true);
    const parsedVariables = parsed.data?.codebook.ego?.variables ?? {};
    for (let index = 0; index < 200; index++) {
      expect(parsedVariables[`a${index}`]).not.toHaveProperty(
        'validation.sameAs',
      );
      expect(parsedVariables[`a${index}`]).not.toHaveProperty(
        'validation.differentFrom',
      );
    }
  });

  it('keeps pinnedEqualDifferentFrom repairs one-at-a-time even when pairwise disjoint', () => {
    // Ten independent number pairs, each pinned to its own index by an equal
    // minValue/maxValue window and joined by `differentFrom` — a
    // `pinnedEqualDifferentFrom` contradiction whose `variableIds` names
    // only its own {a_i, b_i}, exactly like the batchable class above. But
    // `pinnedEqualDifferentFromContradictions` can source either endpoint's
    // pin from an entirely different chain's `propagatedPins` closure (see
    // `NON_BATCHABLE_CONTRADICTION_CLASSES` in migration.ts), so the class is
    // excluded from batching outright — a disjointness check alone cannot
    // tell these ten pairs apart from one that secretly shares a dependency.
    const variables: Record<string, unknown> = {};
    for (let index = 0; index < 10; index++) {
      variables[`a${index}`] = {
        name: `a${index}`,
        type: 'number',
        validation: {
          minValue: index,
          maxValue: index,
          differentFrom: `b${index}`,
        },
      };
      variables[`b${index}`] = {
        name: `b${index}`,
        type: 'number',
        validation: { minValue: index, maxValue: index },
      };
    }

    const migratedRaw = migrateVariables(variables);
    expect(analyser.calls).toBe(11);

    const parsed = ProtocolSchemaV8.safeParse(migratedRaw);
    expect(parsed.success).toBe(true);
    const parsedVariables = parsed.data?.codebook.ego?.variables ?? {};
    for (let index = 0; index < 10; index++) {
      expect(parsedVariables[`a${index}`]).not.toHaveProperty(
        'validation.differentFrom',
      );
      expect(parsedVariables[`a${index}`]).toHaveProperty(
        'validation.minValue',
        index,
      );
      expect(parsedVariables[`b${index}`]).toHaveProperty(
        'validation.minValue',
        index,
      );
    }
  });

  it('batches only the non-overlapping repairs when independent and interdependent contradictions are mixed', () => {
    // `a` sameAs/differentFrom/greaterThanVariable `b` reports both a
    // conflictingReferencePair and a sameAsGroupConflict over the SAME
    // {a, b} — genuinely interdependent (Third-wave Finding 4): stripping
    // sameAs+differentFrom alone already dissolves the group, which leaves
    // greaterThanVariable satisfiable, so it must not also be stripped in the
    // same pre-strip pass. Batching's disjointness check defers whichever of
    // the two is reported second, so only ONE of them (plus the 20 unrelated
    // local repairs) joins pass 1's batch.
    const variables: Record<string, unknown> = {
      a: {
        name: 'a',
        type: 'number',
        validation: {
          sameAs: 'b',
          differentFrom: 'b',
          greaterThanVariable: 'b',
        },
      },
      b: { name: 'b', type: 'number' },
    };
    for (let index = 0; index < 20; index++) {
      variables[`v${index}`] = {
        name: `v${index}`,
        type: 'number',
        validation: { minValue: 10, maxValue: 2, required: true },
      };
    }

    const migratedRaw = migrateVariables(variables);
    // Pass 1 batches the 20 local repairs plus the one non-overlapping
    // structural repair (21 total); pass 2 confirms the fixpoint — the
    // deferred edge is no longer a contradiction once its group has split.
    expect(analyser.calls).toBe(2);

    const parsed = ProtocolSchemaV8.safeParse(migratedRaw);
    expect(parsed.success).toBe(true);
    const parsedVariables = parsed.data?.codebook.ego?.variables;
    expect(parsedVariables?.a).toHaveProperty(
      'validation.greaterThanVariable',
      'b',
    );
    expect(parsedVariables?.a).not.toHaveProperty('validation.sameAs');
    expect(parsedVariables?.a).not.toHaveProperty('validation.differentFrom');
    for (let index = 0; index < 20; index++) {
      expect(parsedVariables?.[`v${index}`]).toEqual({
        name: `v${index}`,
        type: 'number',
        validation: { required: true },
      });
    }
  });
});
