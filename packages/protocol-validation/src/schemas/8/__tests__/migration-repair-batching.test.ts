import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Protocol } from '../../index.ts';
import migrationV7toV8 from '../migration.ts';
import ProtocolSchemaV8 from '../schema.ts';

/**
 * Thirteenth-wave Finding 4: the migration's contradiction-strip fixpoint used
 * to apply exactly ONE contradiction's strips per pass and then re-run the
 * whole analyser, which is quadratic in the number of independent repairs.
 * Independent LOCAL repairs (a single variable's own inverted bound pair, or a
 * `minSelected` above its own option count) are now applied together, while
 * anything structural — reference rules, equality groups, comparator cycles —
 * keeps its one-at-a-time treatment, because those contradictions can be
 * interdependent.
 *
 * Counting analyser invocations is the timing-free way to see which path ran:
 * N independent repairs take 2 analyser runs when batched and N+1 when not.
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

  it('keeps structural repairs strictly one-at-a-time', () => {
    // Ten independent `sameAs` + `differentFrom` pairs. Each is repaired by
    // its own pass — batching them would be unsound in general, since a
    // structural repair can take another contradiction off the list before it
    // is ever applied — so the analyser runs once per repair plus a final
    // confirming pass.
    const variables: Record<string, unknown> = {};
    for (let index = 0; index < 10; index++) {
      variables[`a${index}`] = {
        name: `a${index}`,
        type: 'text',
        validation: { sameAs: `b${index}`, differentFrom: `b${index}` },
      };
      variables[`b${index}`] = { name: `b${index}`, type: 'text' };
    }

    const migratedRaw = migrateVariables(variables);
    expect(analyser.calls).toBe(11);

    const parsed = ProtocolSchemaV8.safeParse(migratedRaw);
    expect(parsed.success).toBe(true);
    const parsedVariables = parsed.data?.codebook.ego?.variables ?? {};
    for (let index = 0; index < 10; index++) {
      expect(parsedVariables[`a${index}`]).not.toHaveProperty(
        'validation.sameAs',
      );
      expect(parsedVariables[`a${index}`]).not.toHaveProperty(
        'validation.differentFrom',
      );
    }
  });

  it('batches only the local repairs when local and structural contradictions are mixed', () => {
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
    // Pass 1 batches the 20 local repairs, pass 2 applies the single
    // structural repair, pass 3 confirms the fixpoint.
    expect(analyser.calls).toBe(3);

    const parsed = ProtocolSchemaV8.safeParse(migratedRaw);
    expect(parsed.success).toBe(true);
    const parsedVariables = parsed.data?.codebook.ego?.variables;
    // The strict comparator only looked group-internal while the sameAs group
    // was intact, so the one-at-a-time structural repair must keep it.
    expect(parsedVariables?.a).toHaveProperty(
      'validation.greaterThanVariable',
      'b',
    );
    expect(parsedVariables?.a).not.toHaveProperty('validation.sameAs');
    expect(parsedVariables?.a).not.toHaveProperty('validation.differentFrom');
  });
});
