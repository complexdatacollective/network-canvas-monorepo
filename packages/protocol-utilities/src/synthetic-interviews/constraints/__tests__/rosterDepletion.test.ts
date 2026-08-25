import { describe, expect, it } from 'vitest';

import {
  fewestTakenFrom,
  mostTakenFrom,
  type RosterUse,
} from '../rosterDepletion';

/**
 * Shared-pool depletion, asked directly.
 *
 * The interesting cases are the ones a per-stage question gets wrong: several
 * stages that could each have kept off a later pool, but cannot all do so at
 * once, because a row one of them takes is a row none of the others can. So
 * alongside the worked examples there is an exhaustive oracle — every way the
 * rows could actually be handed out, enumerated — and a sweep of random shapes
 * held to it. An approximation that is merely close would pass the examples
 * and fail the sweep.
 */

const setOf = (...uids: string[]): ReadonlySet<string> => new Set(uids);

const use = (
  uids: readonly string[],
  guaranteedTake: number,
  ceilingTake = guaranteedTake,
): RosterUse => ({
  uids: new Set(uids),
  guaranteedTake,
  ceilingTake,
});

/**
 * Every way the rows could be handed out, enumerated: each row goes to one of
 * the stages whose pool offers it, or to nobody. Deliberately written as
 * exhaustive search rather than as arithmetic — an oracle sharing the
 * subject's reasoning proves nothing about it.
 */
const allocations = (
  pools: readonly ReadonlySet<string>[],
  rows: readonly string[],
): number[][] => {
  const results: number[][] = [];

  const walk = (index: number, taken: number[]): void => {
    if (index === rows.length) {
      results.push([...taken]);
      return;
    }
    const uid = rows[index];
    if (uid === undefined) return;

    walk(index + 1, taken);
    pools.forEach((pool, holder) => {
      if (!pool.has(uid)) return;
      const next = [...taken];
      next[holder] = (next[holder] ?? 0) + 1;
      // Which rows went where matters only through the target, so the search
      // carries the per-stage tallies and the target tally alone.
      walk(index + 1, next);
    });
  };

  walk(
    0,
    Array.from({ length: pools.length }, () => 0),
  );
  return results;
};

/**
 * The oracle proper: every allocation, scored by how much of `target` it
 * spends, filtered to the ones the stages' own limits allow.
 *
 * `fewest` is null where no allocation meets every guarantee at once — a
 * shape the counting pass cannot produce (a stage's guarantee is derived
 * AFTER subtracting the most the stages before it can take, so the guarantees
 * are achievable in order by construction) but one a random sweep will hand
 * over, and there is no fewest-of-nothing to compare against.
 */
const bySearch = (
  uses: readonly RosterUse[],
  target: ReadonlySet<string>,
): { most: number; fewest: number | null } => {
  const rows = [...new Set(uses.flatMap((entry) => [...entry.uids]))];
  const pools = uses.map((entry) => entry.uids);
  const inTarget = new Set(target);

  let most = 0;
  let fewest = Number.POSITIVE_INFINITY;

  const walk = (index: number, taken: number[], fromTarget: number): void => {
    if (index === rows.length) {
      const withinCeilings = uses.every(
        (entry, holder) => (taken[holder] ?? 0) <= entry.ceilingTake,
      );
      const meetsGuarantees = uses.every(
        (entry, holder) => (taken[holder] ?? 0) === entry.guaranteedTake,
      );
      if (withinCeilings) most = Math.max(most, fromTarget);
      if (meetsGuarantees) fewest = Math.min(fewest, fromTarget);
      return;
    }

    const uid = rows[index];
    if (uid === undefined) return;

    walk(index + 1, taken, fromTarget);
    pools.forEach((pool, holder) => {
      if (!pool.has(uid)) return;
      const next = [...taken];
      next[holder] = (next[holder] ?? 0) + 1;
      walk(index + 1, next, fromTarget + (inTarget.has(uid) ? 1 : 0));
    });
  };

  walk(
    0,
    Array.from({ length: uses.length }, () => 0),
    0,
  );
  return { most, fewest: Number.isFinite(fewest) ? fewest : null };
};

describe('the rows earlier stages must have taken', () => {
  it('is nothing where no stage draws from the pool at all', () => {
    expect(fewestTakenFrom([], setOf('a', 'b'))).toBe(0);
    expect(mostTakenFrom([], setOf('a', 'b'))).toBe(0);
  });

  it('is nothing where the earlier pools are disjoint from this one', () => {
    const uses = [use(['x', 'y'], 2)];
    expect(fewestTakenFrom(uses, setOf('a', 'b'))).toBe(0);
    expect(mostTakenFrom(uses, setOf('a', 'b'))).toBe(0);
  });

  it('is what one stage cannot place anywhere else', () => {
    // Four rows, two of them shared. Taking three, one has to land on a
    // shared row; taking two, none has to.
    const pool = ['a', 'b', 'c', 'd'];
    expect(fewestTakenFrom([use(pool, 3)], setOf('c', 'd'))).toBe(1);
    expect(fewestTakenFrom([use(pool, 2)], setOf('c', 'd'))).toBe(0);
  });

  it('holds two stages over one pool to the rows they jointly spend', () => {
    // The shape a per-stage question gets wrong: either stage alone could
    // have taken its two rows from outside {c, d}, but between them they take
    // four distinct rows out of four, so both shared rows are gone.
    const pool = ['a', 'b', 'c', 'd'];
    const uses = [use(pool, 2), use(pool, 2)];

    expect(fewestTakenFrom(uses, setOf('c', 'd'))).toBe(2);
    expect(bySearch(uses, setOf('c', 'd')).fewest).toBe(2);
  });

  it('reads a crowded pair of stages past an uninvolved third', () => {
    // Two stages sharing a two-row pool empty it between them; a third stage
    // with a large pool of its own is beside the point. A bound that only
    // ever asked "all of them together" would let the third stage's spare
    // rows absorb the pair's takes and report nothing.
    const uses = [
      use(['a', 'b'], 1),
      use(['a', 'b'], 1),
      use(['p', 'q', 'r', 's'], 0),
    ];

    expect(fewestTakenFrom(uses, setOf('a'))).toBe(1);
    expect(bySearch(uses, setOf('a')).fewest).toBe(1);
  });

  it('never reports more rows than the pool holds', () => {
    const pool = ['a', 'b'];
    expect(fewestTakenFrom([use(pool, 2), use(pool, 2)], setOf('a', 'b'))).toBe(
      2,
    );
  });
});

describe('the rows earlier stages can have taken', () => {
  it('is bounded by what they can reach, not by what they want', () => {
    // A ceiling of five against two shared rows takes two.
    expect(mostTakenFrom([use(['a', 'b'], 0, 5)], setOf('a', 'b'))).toBe(2);
  });

  it('does not let two stages take the same row twice', () => {
    const uses = [use(['a', 'b'], 0, 4), use(['a', 'b'], 0, 4)];
    expect(mostTakenFrom(uses, setOf('a', 'b'))).toBe(2);
    expect(bySearch(uses, setOf('a', 'b')).most).toBe(2);
  });

  it('adds up where the stages reach different rows', () => {
    const uses = [use(['a', 'b'], 0, 1), use(['b', 'c'], 0, 1)];
    expect(mostTakenFrom(uses, setOf('a', 'b', 'c'))).toBe(2);
  });
});

describe('held to an exhaustive search of the allocations', () => {
  /**
   * A small, self-contained generator: the sweep must be the same sweep on
   * every machine and every run, so a refusal it exposes can be reproduced
   * from the index alone.
   */
  const streamFrom = (seed: number): (() => number) => {
    let state = (seed * 2654435761) >>> 0;
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0x1_0000_0000;
    };
  };

  it('matches the search on every shape it is given', () => {
    const rows = ['a', 'b', 'c', 'd', 'e'];
    const disagreements: {
      index: number;
      subject: { most: number; fewest: number };
      search: { most: number; fewest: number | null };
    }[] = [];
    let compared = 0;
    let interesting = 0;

    for (let index = 0; index < 400; index += 1) {
      const draw = streamFrom(index + 1);
      const useCount = 1 + Math.floor(draw() * 3);
      const uses: RosterUse[] = [];

      for (let held = 0; held < useCount; held += 1) {
        const pool = rows.filter(() => draw() < 0.6);
        if (pool.length === 0) pool.push('a');
        const guaranteedTake = Math.floor(draw() * (pool.length + 1));
        const ceilingTake =
          guaranteedTake +
          Math.floor(draw() * (pool.length - guaranteedTake + 1));
        uses.push(use(pool, guaranteedTake, ceilingTake));
      }

      const target = new Set(rows.filter(() => draw() < 0.5));
      if (target.size === 0) continue;

      const subject = {
        most: mostTakenFrom(uses, target),
        fewest: fewestTakenFrom(uses, target),
      };
      const search = bySearch(uses, target);
      if (search.fewest === null) continue;

      compared += 1;
      if (subject.fewest > 0 || subject.most > 0) interesting += 1;
      if (subject.most !== search.most || subject.fewest !== search.fewest) {
        disagreements.push({ index, subject, search });
      }
    }

    expect(disagreements).toEqual([]);
    // Neither vacuous nor all-zero: a sweep that compared nothing, or one
    // whose every shape answered nothing, would agree with anything.
    expect(compared).toBeGreaterThan(100);
    expect(interesting).toBeGreaterThan(50);
  });

  it('exercised shapes where the answer is not zero', () => {
    // The sweep above would pass vacuously on shapes that all answer nothing.
    expect(
      allocations([setOf('a', 'b'), setOf('b', 'c')], ['a', 'b', 'c']).length,
    ).toBeGreaterThan(1);
    expect(fewestTakenFrom([use(['a', 'b'], 2)], setOf('a', 'b'))).toBe(2);
  });
});
