import { describe, expect, it, vi } from 'vitest';

import {
  asEntityAttributeReference,
  type Stage,
  type StructuralCodebook,
  type Variables,
} from '@codaco/protocol-validation';

import { ValueGenerator } from '../../../ValueGenerator';
import { type FeasibilityConfig, resolveGenerationConfig } from '../../config';
import type { GenerationContext } from '../../context';
import { buildEntityConstraints } from '../buildConstraints';
import { analyseFeasibility } from '../feasibility';
import { generateEntityAttributes } from '../generateEntityAttributes';
import { UniqueRegistry } from '../uniqueRegistry';

// A three-node search budget: any component of five or more variables
// provably exceeds it, since a solution alone needs one node per variable.
// Only the search budget shrinks; every other limit keeps its real value.
vi.mock(import('../solverLimits'), async (importOriginal) => ({
  ...(await importOriginal()),
  MAX_SEARCH_NODES: 3,
}));

const TODAY = '2026-07-27';
const config = resolveGenerationConfig({ today: TODAY });

/** Worst-case bounds for `analyseFeasibility`, constructed literally. */
const feasibilityConfig: FeasibilityConfig = {
  nodeCount: { min: 1, max: 8 },
  rosterDrawRatio: 0.7,
  sociogramEdgeProbability: { min: 0.3, max: 0.5 },
  censusEdgeProbability: { min: 0.4, max: 0.6 },
  networkComposerEdgeProbability: { min: 0.05, max: 0.1 },
  familyPedigreeNodeCount: { min: 4, max: 10 },
  today: TODAY,
};

const nameGenerator = {
  id: 'stage-1',
  type: 'NameGenerator',
  label: 'Name generator',
  subject: { entity: 'node', type: 'person' },
  prompts: [{ id: 'p1', text: 'Name people' }],
  behaviours: { maxNodes: 8 },
} as unknown as Stage;

/** Five booleans in a ring of differentFrom: an odd cycle, unsatisfiable. */
function oddRingVariables(): Record<string, unknown> {
  const variables: Record<string, unknown> = {};
  for (let i = 0; i < 5; i++) {
    variables[`v${i}`] = {
      name: `V${i}`,
      type: 'boolean',
      validation: { differentFrom: i > 0 ? `v${i - 1}` : 'v4' },
    };
  }
  return variables;
}

describe('solver search budget exhaustion', () => {
  it('keeps delegated contradiction proofs independent of the search budget', () => {
    // The generation solver reaches "unknown" under this budget, but
    // protocol-validation proves Boolean parity directly. Delegating that
    // proof must not weaken it according to a generation-only search limit.
    const codebook = {
      node: {
        person: { color: 'node-color-seq-1', variables: oddRingVariables() },
      },
    } as unknown as StructuralCodebook;

    expect(
      analyseFeasibility(codebook, [nameGenerator], feasibilityConfig),
    ).toEqual([
      expect.objectContaining({
        rules: ['differentFrom'],
        variableNames: ['V0', 'V1', 'V2', 'V3', 'V4'],
      }),
    ]);
  });

  it('generates through the greedy path when the search budget runs out', () => {
    // Six values in a ring over [0, 4] is satisfiable but needs at least six
    // nodes; under the tiny budget the solve reports unknown and the greedy
    // path must still produce a complete entity.
    const variables: Variables = {};
    for (let i = 0; i < 6; i++) {
      variables[`v${i}`] = {
        name: `V${i}`,
        type: 'number',
        validation: {
          minValue: 0,
          maxValue: 4,
          differentFrom: asEntityAttributeReference(i > 0 ? `v${i - 1}` : 'v5'),
        },
      };
    }
    const entity = buildEntityConstraints(variables, TODAY);

    const ctx: GenerationContext = {
      codebook: {},
      valueGen: new ValueGenerator(1, TODAY),
      config,
      usedRosterUids: new Set(),
      externalData: undefined,
      respectSkipLogicAndFiltering: false,
      uniqueRegistry: new UniqueRegistry(),
      entityConstraints: { ego: new Map(), node: new Map(), edge: new Map() },
    };

    const spy = vi.spyOn(ctx.valueGen, 'scopedInt');
    const attrs = generateEntityAttributes(
      entity,
      ctx,
      { entity: 'node', type: 'person' },
      0,
    );

    expect(Object.keys(attrs)).toHaveLength(6);
    for (let i = 0; i < 6; i++) {
      const value = Number(attrs[`v${i}`]);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(4);
    }

    // The abandoned solve's shuffle seed is one draw from its OWN addressed
    // stream, and the six greedy value draws each consume their own
    // variable's semantic substream, so however the search ends — success,
    // failure, or budget exhaustion — no other consumer's sequence moves.
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
