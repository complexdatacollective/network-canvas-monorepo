import { invariant } from '../utils/invariant';

/**
 * How many of a roster's rows the stages before it have taken.
 *
 * The one fact this module exists to hold on to is that roster takes are
 * DISJOINT. A row a stage nominates is in the interview network from that
 * moment, and every roster view hides the people already there
 * (`displayedRosterNodes`), so no second stage can take it. Two stages drawing
 * two rows each from one four-row pool therefore empty it, however freely each
 * of them could have avoided any particular row on its own.
 *
 * Judging each earlier stage in isolation misses exactly that: asked "could
 * this stage have kept off the later pool?", each answers yes, and the
 * later stage is reported as comfortable while every seed starves it. So both
 * questions the counting pass asks — the FEWEST rows earlier stages must have
 * taken from a pool, and the MOST they can have taken — are answered here over
 * all of them at once.
 *
 * Both answers are exact for the model they are asked in (each stage takes
 * somewhere between its guaranteed and its ceiling take, from its own pool,
 * and no row twice). Exactness matters in both directions: a depletion floor
 * that is too low leaves a starved stage approved, which is the seed-dependent
 * mid-walk failure the pre-seed gate exists to make impossible, and one that
 * is too high refuses a batch every seed could complete.
 */

/** One roster-backed stage's claim on the rows a shared pool offers. */
export type RosterUse = {
  /** The rows this stage's own pool offers. */
  uids: ReadonlySet<string>;
  /** The rows it takes on EVERY seed, however its draws land. */
  guaranteedTake: number;
  /** The most rows it can take on any seed. */
  ceilingTake: number;
};

/** One stage's claim, reduced to what the assignment question reads. */
type Claim = { uids: ReadonlySet<string>; capacity: number };

type Arc = { from: number; to: number; capacity: number };

/** Residual capacity, `from` -> `to` -> what is left. */
type Residual = Map<number, Map<number, number>>;

const residualCapacity = (
  residual: Residual,
  from: number,
  to: number,
): number => residual.get(from)?.get(to) ?? 0;

const adjustResidual = (
  residual: Residual,
  from: number,
  to: number,
  delta: number,
): void => {
  const outgoing = residual.get(from) ?? new Map<number, number>();
  outgoing.set(to, (outgoing.get(to) ?? 0) + delta);
  residual.set(from, outgoing);
};

/**
 * Maximum flow from `source` to `sink`, by shortest augmenting path.
 *
 * The networks this answers are three layers deep and a handful of nodes wide
 * — one node per roster-backed stage, one per group of rows that the same
 * stages can reach — so the textbook algorithm is chosen for being the one
 * that is obviously right rather than the one that is fastest.
 */
const maxFlow = (
  arcs: readonly Arc[],
  source: number,
  sink: number,
): number => {
  const residual: Residual = new Map();
  for (const arc of arcs) {
    adjustResidual(residual, arc.from, arc.to, arc.capacity);
  }

  let flow = 0;

  for (;;) {
    // Breadth-first, so the path found is the shortest one still open. The
    // queue is walked as it grows, which is what makes this a BFS rather than
    // a stack-shaped search.
    const cameFrom = new Map<number, number>();
    cameFrom.set(source, source);
    const queue: number[] = [source];
    for (const node of queue) {
      if (cameFrom.has(sink)) break;
      const outgoing = residual.get(node) ?? new Map<number, number>();
      for (const [next, capacity] of outgoing) {
        if (capacity <= 0 || cameFrom.has(next)) continue;
        cameFrom.set(next, node);
        queue.push(next);
      }
    }
    if (!cameFrom.has(sink)) return flow;

    const walkBack = (visit: (from: number, to: number) => void): void => {
      let node = sink;
      while (node !== source) {
        const previous = cameFrom.get(node);
        invariant(
          previous !== undefined,
          'an augmenting path must reach the source it was traced from',
        );
        visit(previous, node);
        node = previous;
      }
    };

    let pushed = Number.POSITIVE_INFINITY;
    walkBack((from, to) => {
      pushed = Math.min(pushed, residualCapacity(residual, from, to));
    });
    invariant(
      pushed > 0 && Number.isFinite(pushed),
      'an augmenting path must carry a finite, positive amount',
    );
    walkBack((from, to) => {
      adjustResidual(residual, from, to, -pushed);
      adjustResidual(residual, to, from, pushed);
    });
    flow += pushed;
  }
};

/**
 * The most rows of `rows` the claims can jointly take, spending at most each
 * claim's own capacity and taking no row twice.
 *
 * Rows are grouped by WHICH claims can reach them, because that is the only
 * thing that distinguishes one row from another here: two rows both offered by
 * the same stages are interchangeable, so the network carries one node per
 * group with the group's size as its capacity. A pool of a thousand rows
 * shared by three stages is four nodes, not a thousand.
 */
const mostAssignable = (
  claims: readonly Claim[],
  rows: ReadonlySet<string>,
): number => {
  if (claims.length === 0 || rows.size === 0) return 0;

  const groups = new Map<string, { members: number[]; size: number }>();
  for (const uid of rows) {
    const members: number[] = [];
    claims.forEach((claim, index) => {
      if (claim.uids.has(uid)) members.push(index);
    });
    if (members.length === 0) continue;

    const key = members.join(',');
    const held = groups.get(key);
    if (held !== undefined) {
      held.size += 1;
      continue;
    }
    groups.set(key, { members, size: 1 });
  }
  if (groups.size === 0) return 0;

  // Node 0 is the source, 1..claims.length the claims, then one per group,
  // and the sink last.
  const source = 0;
  const sink = claims.length + groups.size + 1;
  const arcs: Arc[] = [];

  claims.forEach((claim, index) => {
    if (claim.capacity > 0) {
      arcs.push({ from: source, to: index + 1, capacity: claim.capacity });
    }
  });

  let groupNode = claims.length + 1;
  for (const group of groups.values()) {
    for (const member of group.members) {
      arcs.push({ from: member + 1, to: groupNode, capacity: group.size });
    }
    arcs.push({ from: groupNode, to: sink, capacity: group.size });
    groupNode += 1;
  }

  return maxFlow(arcs, source, sink);
};

/**
 * The MOST rows of `target` the earlier stages can have taken between them —
 * the depletion a stage meets on its unluckiest seed, which is what bounds the
 * take it is guaranteed to make.
 */
export const mostTakenFrom = (
  uses: readonly RosterUse[],
  target: ReadonlySet<string>,
): number =>
  mostAssignable(
    uses.map((use) => ({ uids: use.uids, capacity: use.ceilingTake })),
    target,
  );

/**
 * The FEWEST rows of `target` the earlier stages must have taken between them
 * — the depletion a stage meets even on its luckiest seed, which is what a
 * min-nodes refusal is measured against.
 *
 * Counted as the guaranteed takes MINUS the most of them that can land
 * anywhere else: every earlier stage takes at least its guarantee, those rows
 * are all distinct, and the ones that miss `target` have to fit in the rows
 * outside it that their own pools offer. Whatever will not fit there is a row
 * of `target` that no seed can save.
 */
export const fewestTakenFrom = (
  uses: readonly RosterUse[],
  target: ReadonlySet<string>,
): number => {
  let guaranteed = 0;
  const elsewhere = new Set<string>();
  for (const use of uses) {
    guaranteed += use.guaranteedTake;
    for (const uid of use.uids) {
      if (!target.has(uid)) elsewhere.add(uid);
    }
  }
  if (guaranteed === 0) return 0;

  const placedElsewhere = mostAssignable(
    uses.map((use) => ({ uids: use.uids, capacity: use.guaranteedTake })),
    elsewhere,
  );

  // Clamped to the pool itself: takes are distinct, so no more of `target` can
  // go than it holds, whatever the arithmetic above reaches.
  return Math.max(0, Math.min(guaranteed - placedElsewhere, target.size));
};
