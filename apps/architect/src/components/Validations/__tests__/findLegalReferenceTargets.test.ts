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

  it('keeps the analyser call count bounded (not growing with candidate count) when a few candidates are reference-connected to each other but not to the edited variable', () => {
    // `pairA`/`pairB` are mutually `sameAs` (their own fixed rule) but
    // disjoint from `b` — only the first one iterated can share the batched
    // call; the other still needs its own pruned call. Every other candidate
    // has no reference rules at all, and `b` itself starts with no external
    // reference of its own, so the batched path stays available.
    const allVariables: Record<string, unknown> = {
      b: numberVariable('B'),
      pairA: numberVariable('pairA', { sameAs: 'pairB' }),
      pairB: numberVariable('pairB'),
    };
    const candidateIds = ['pairA', 'pairB'];
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
    // first) plus one individual call for the pair member that lost the
    // race — never one call per candidate (52).
    expect(analyser.calls).toBeLessThanOrEqual(2);
    expect(analyser.calls).toBeLessThan(candidateIds.length);
  });

  it('falls back to one call per candidate once the edited variable already has an external fixed reference of its own', () => {
    // Twenty-eighth-wave finding: `linked` already targets `b` (the edited
    // variable) with its own fixed rule, which puts `b` in a non-trivial
    // component BEFORE any candidate is chosen. A batched clone can only
    // represent `b` under one synthetic id per candidate, so it cannot also
    // carry `linked`'s edge into `b` — sharing the batch here would silently
    // drop that edge from every OTHER candidate's judgement too (see
    // `findLegalReferenceTargets: batched clone must retain the edited
    // variable's incoming references` below for the resulting wrong
    // answer). Once `b` has ANY external reference, batching is unavailable
    // for every candidate, not only `linked` itself, so the call count
    // degrades to one per candidate.
    const allVariables: Record<string, unknown> = {
      b: numberVariable('B'),
      linked: numberVariable('linked', { lessThanVariable: 'b' }),
    };
    const candidateIds = ['linked'];
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

    expect(analyser.calls).toBe(candidateIds.length);
  });
});

describe("findLegalReferenceTargets: batched clone must retain the edited variable's incoming references", () => {
  beforeEach(() => {
    analyser.calls = 0;
  });

  it("excludes a candidate that only becomes infeasible through a THIRD variable's fixed incoming edge into the edited variable", () => {
    // x already requires x < a (a fixed rule of x's own, not under test) and
    // is pinned to exactly 10, so a must be > 10. Candidate `farBelow` is
    // pinned to exactly 5 and belongs to its own, otherwise-disjoint
    // component before the rule under test is added — the batched path's
    // eligibility check (candidate's own root vs `a`'s root) would normally
    // wave it through. Choosing it as a's lessThanVariable target requires
    // a < 5 as well as a > 10 (from x), which is infeasible — the FULL
    // one-candidate draft analyser (`legalTargetsOneCallPerCandidate`,
    // exercised via `findDraftContradictions`) correctly excludes it. A
    // batched clone that drops x's `x < a` edge (because it deletes `a`'s
    // own entry outright instead of keeping it addressable) would miss the
    // chain and wrongly call it legal.
    const allVariables: Record<string, unknown> = {
      x: numberVariable('x', {
        minValue: 10,
        maxValue: 10,
        lessThanVariable: 'a',
      }),
      a: numberVariable('a'),
      farBelow: numberVariable('farBelow', { minValue: 5, maxValue: 5 }),
      farAbove: numberVariable('farAbove', { minValue: 100, maxValue: 100 }),
    };
    const candidateIds = ['farBelow', 'farAbove'];
    const input: ReferenceTargetLegalityInput = {
      allVariables,
      currentVariableId: 'a',
      variableType: 'number',
      validation: {},
      ruleKey: 'lessThanVariable',
      candidateIds,
    };

    const expected = legalTargetsOneCallPerCandidate(input);
    const actual = findLegalReferenceTargets(input);

    // Confirms the fixture exercises both an illegal candidate (the chain
    // through x) and a legal one (10 < a < 100 is satisfiable).
    expect(expected).toEqual(new Set(['farAbove']));
    expect(actual).toEqual(expected);
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
