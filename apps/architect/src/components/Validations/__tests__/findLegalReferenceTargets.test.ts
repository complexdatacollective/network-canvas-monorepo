import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  findDraftContradictions,
  type ReferenceTargetLegalityInput,
} from '../contradictions';

/**
 * Twenty-third-wave Finding 3: counting analyser invocations is the
 * timing-free way to confirm `findLegalReferenceTargets` computes candidate
 * legality with a bounded number of `findValidationContradictions` calls
 * rather than one call per candidate (which re-analysed the whole record for
 * every candidate — quadratic in variable count). Mock pattern follows
 * packages/protocol-validation/src/schemas/8/__tests__/migration-repair-batching.test.ts.
 */
const { analyser } = vi.hoisted(() => ({ analyser: { calls: 0 } }));

vi.mock('@codaco/protocol-validation', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@codaco/protocol-validation')>();
  return {
    ...actual,
    findValidationContradictions: (variables: Record<string, unknown>) => {
      analyser.calls += 1;
      return actual.findValidationContradictions(variables);
    },
  };
});

// Imported AFTER the mock is registered above (vitest hoists `vi.mock` above
// this import regardless of source order) so every analyser call it makes,
// directly or via `findDraftContradictions`, is counted.
const { findLegalReferenceTargets } = await import('../contradictions');

const numberVariable = (
  name: string,
  validation: Record<string, unknown> = {},
) => ({ name, type: 'number', validation });

/**
 * The pre-optimisation approach: one `findDraftContradictions` call per
 * candidate, each re-analysing the whole record. Kept here (rather than
 * reimplementing the analyser's rules) as an independent oracle for the
 * equivalence tests below, so a bug that lands identically in both the
 * batched implementation and a hand-rolled expectation can't hide.
 */
const legalTargetsOneCallPerCandidate = ({
  allVariables,
  currentVariableId,
  variableType,
  validation,
  ruleKey,
  replacingKey,
  candidateIds,
  component,
  options,
  parameters,
}: ReferenceTargetLegalityInput): Set<string> => {
  const legal = new Set<string>();
  for (const candidateId of candidateIds) {
    const prospective: Record<string, unknown> = { ...validation };
    if (replacingKey && replacingKey !== ruleKey) {
      delete prospective[replacingKey];
    }
    prospective[ruleKey] = candidateId;
    const contradictions = findDraftContradictions({
      allVariables,
      currentVariableId,
      variableType,
      validation: prospective,
      component,
      options,
      parameters,
    });
    if (contradictions.length === 0) {
      legal.add(candidateId);
    }
  }
  return legal;
};

describe('findLegalReferenceTargets: analyser invocation count', () => {
  beforeEach(() => {
    analyser.calls = 0;
  });

  it('calls the analyser once for many candidates with no reference rules among them', () => {
    const allVariables: Record<string, unknown> = {
      b: numberVariable('B'),
    };
    const candidateIds: string[] = [];
    for (let index = 0; index < 50; index++) {
      const id = `v${index}`;
      allVariables[id] = numberVariable(id);
      candidateIds.push(id);
    }

    const legal = findLegalReferenceTargets({
      allVariables,
      currentVariableId: 'b',
      variableType: 'number',
      validation: {},
      ruleKey: 'lessThanVariable',
      candidateIds,
    });

    expect(analyser.calls).toBe(1);
    expect(legal.size).toBe(candidateIds.length);
  });

  it('keeps the analyser call count bounded (not growing with candidate count) when a few candidates are reference-connected to the edited variable or to each other', () => {
    // `linked` already targets `b` (the edited variable) with its own fixed
    // rule, so it must be checked individually. `pairA`/`pairB` are mutually
    // `sameAs` (their own fixed rule) but disjoint from `b` — only the first
    // one iterated can share the batched call; the other still needs its own
    // pruned call. Every other candidate has no reference rules at all.
    const allVariables: Record<string, unknown> = {
      b: numberVariable('B'),
      linked: numberVariable('linked', { lessThanVariable: 'b' }),
      pairA: numberVariable('pairA', { sameAs: 'pairB' }),
      pairB: numberVariable('pairB'),
    };
    const candidateIds = ['linked', 'pairA', 'pairB'];
    for (let index = 0; index < 50; index++) {
      const id = `v${index}`;
      allVariables[id] = numberVariable(id);
      candidateIds.push(id);
    }

    findLegalReferenceTargets({
      allVariables,
      currentVariableId: 'b',
      variableType: 'number',
      validation: {},
      ruleKey: 'lessThanVariable',
      candidateIds,
    });

    // One shared batch call for every disjoint, unclaimed component (the 50
    // isolated candidates plus whichever of pairA/pairB claims the batch
    // first) plus one individual call each for `linked` and the pair member
    // that lost the race — never one call per candidate (53).
    expect(analyser.calls).toBeLessThanOrEqual(3);
    expect(analyser.calls).toBeLessThan(candidateIds.length);
  });
});

describe('findLegalReferenceTargets: equivalence with the one-call-per-candidate approach', () => {
  beforeEach(() => {
    analyser.calls = 0;
  });

  it('matches the un-batched result across legal, illegal, cyclic and shared-component candidates', () => {
    // a: already requires a < b (edited variable) — choosing "a" as b's own
    //    lessThanVariable target would close a strict cycle: illegal.
    // c: isolated, no bounds: legal.
    // d: maxValue 10, while b already requires >= 50: disjoint bounds,
    //    illegal (b < d is impossible once b >= 50 > 10 >= d).
    // e/f: mutually sameAs, disjoint from b: legal, and exercise the
    //    shared-external-component path (only one of the two can join the
    //    batched call; the other is routed individually).
    const allVariables = {
      a: numberVariable('a', { lessThanVariable: 'b' }),
      b: numberVariable('b', { minValue: 50 }),
      c: numberVariable('c'),
      d: numberVariable('d', { maxValue: 10 }),
      e: numberVariable('e', { sameAs: 'f' }),
      f: numberVariable('f'),
    };
    const candidateIds = ['a', 'c', 'd', 'e', 'f'];
    const input: ReferenceTargetLegalityInput = {
      allVariables,
      currentVariableId: 'b',
      variableType: 'number',
      validation: { minValue: 50 },
      ruleKey: 'lessThanVariable',
      candidateIds,
    };

    const expected = legalTargetsOneCallPerCandidate(input);
    const actual = findLegalReferenceTargets(input);

    // Confirms the fixture genuinely exercises both legal and illegal
    // candidates — a test that could pass with every candidate legal (or
    // every candidate illegal) wouldn't catch a dropped or wrongly-added
    // candidate.
    expect(expected).toEqual(new Set(['c', 'e', 'f']));
    expect(actual).toEqual(expected);
  });

  it('matches the un-batched result when replacing an existing rule of a different type', () => {
    // b currently has `sameAs: g` (a different rule than the one under
    // test). Editing b's NEW `differentFrom` rule must judge candidates
    // against b's OTHER rules with `sameAs` still intact (replacingKey is
    // undefined — a different rule key, not a retype of this one) plus the
    // candidate under test, exactly like the un-batched approach.
    const allVariables = {
      b: numberVariable('b', { sameAs: 'g' }),
      g: numberVariable('g'),
      h: numberVariable('h'),
    };
    const candidateIds = ['g', 'h'];
    const input: ReferenceTargetLegalityInput = {
      allVariables,
      currentVariableId: 'b',
      variableType: 'number',
      validation: { sameAs: 'g' },
      ruleKey: 'differentFrom',
      candidateIds,
    };

    const expected = legalTargetsOneCallPerCandidate(input);
    const actual = findLegalReferenceTargets(input);

    // `differentFrom: g` while `sameAs: g` also holds is a direct
    // contradiction; `h` has no relationship to b at all.
    expect(expected).toEqual(new Set(['h']));
    expect(actual).toEqual(expected);
  });

  it('matches the un-batched result for a brand new variable (no currentVariableId)', () => {
    const allVariables = {
      p: numberVariable('p', { maxValue: 1 }),
      q: numberVariable('q', { minValue: 100 }),
    };
    const candidateIds = ['p', 'q'];
    const input: ReferenceTargetLegalityInput = {
      allVariables,
      currentVariableId: '',
      variableType: 'number',
      validation: { minValue: 10 },
      ruleKey: 'lessThanVariable',
      candidateIds,
    };

    const expected = legalTargetsOneCallPerCandidate(input);
    const actual = findLegalReferenceTargets(input);

    // New draft requires >= 10; `p` maxes out at 1 (disjoint), `q` has no
    // upper bound so `draft < q` is satisfiable.
    expect(expected).toEqual(new Set(['q']));
    expect(actual).toEqual(expected);
  });
});
