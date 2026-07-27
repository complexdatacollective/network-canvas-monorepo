import {
  COMPARISON_RULES,
  type ComparisonRule,
  type EntityConstraints,
} from './types';

export type GenerationOrder = {
  /**
   * Group representative ids, in the order they must be generated. A valid
   * topological order is guaranteed only when `cycles` is empty: every group
   * is still listed when it is not, but walking it then generates values whose
   * dependencies do not exist yet.
   */
  order: string[];
  /** Member ids keyed by their group's representative id. */
  membersOf: Map<string, string[]>;
  /** Representative id keyed by member id. */
  groupOf: Map<string, string>;
  /** Unsatisfiable reference cycles, as lists of variable ids. Empty when none. */
  cycles: string[][];
};

/**
 * A comparator constraint in one canonical direction: `upper` must be greater
 * than (`strict`) or at least (`!strict`) `lower`.
 */
type ComparatorEdge = {
  lower: string;
  upper: string;
  strict: boolean;
};

type DifferentFromPair = {
  dependent: string;
  target: string;
};

const COMPARATOR_DIRECTION: Record<
  ComparisonRule,
  { ownerIsUpper: boolean; strict: boolean }
> = {
  greaterThanVariable: { ownerIsUpper: true, strict: true },
  lessThanVariable: { ownerIsUpper: false, strict: true },
  greaterThanOrEqualToVariable: { ownerIsUpper: true, strict: false },
  lessThanOrEqualToVariable: { ownerIsUpper: false, strict: false },
};

// Variable ids never contain a NUL, so joining on one cannot collide.
const KEY_SEPARATOR = '\u0000';

/**
 * `sameAs` is symmetric and transitive in effect — every member of a chain
 * ends up holding one value — so those variables merge into a single group
 * that generates once. Comparator and `differentFrom` references become edges
 * between groups.
 */
function buildSameAsGroups(entity: EntityConstraints): {
  groupOf: Map<string, string>;
  membersOf: Map<string, string[]>;
} {
  const parent = new Map<string, string>();
  for (const id of entity.keys()) parent.set(id, id);

  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let cursor = id;
    while (parent.get(cursor) !== root) {
      const next = parent.get(cursor)!;
      parent.set(cursor, root);
      cursor = next;
    }
    return root;
  };

  const union = (a: string, b: string): void => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootB, rootA);
  };

  for (const [id, variable] of entity) {
    const target = variable.constraints.sameAs;
    if (target !== undefined && entity.has(target)) union(target, id);
  }

  const groupOf = new Map<string, string>();
  const membersOf = new Map<string, string[]>();
  for (const id of entity.keys()) {
    const root = find(id);
    groupOf.set(id, root);
    const members = membersOf.get(root) ?? [];
    members.push(id);
    membersOf.set(root, members);
  }

  return { groupOf, membersOf };
}

/**
 * Rewrites all four comparators into the single `{ lower, upper, strict }`
 * direction and dedupes the result, so one constraint written from both sides
 * ("end after start" plus "start before end") collapses to one edge instead of
 * looking like a cycle.
 */
function canonicalComparatorEdges(entity: EntityConstraints): ComparatorEdge[] {
  const edges: ComparatorEdge[] = [];
  const seen = new Set<string>();

  for (const [id, variable] of entity) {
    for (const rule of COMPARISON_RULES) {
      const target = variable.constraints[rule];
      if (target === undefined || !entity.has(target)) continue;

      const { ownerIsUpper, strict } = COMPARATOR_DIRECTION[rule];
      const lower = ownerIsUpper ? target : id;
      const upper = ownerIsUpper ? id : target;

      const key = [lower, upper, String(strict)].join(KEY_SEPARATOR);
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ lower, upper, strict });
    }
  }

  return edges;
}

/**
 * `differentFrom` is symmetric, so a pair declared from both sides is one
 * constraint. The first declaration in codebook order wins, which keeps the
 * direction of the retained ordering edge deterministic.
 */
function differentFromPairs(entity: EntityConstraints): DifferentFromPair[] {
  const pairs: DifferentFromPair[] = [];
  const seen = new Set<string>();

  for (const [id, variable] of entity) {
    const target = variable.constraints.differentFrom;
    if (target === undefined || !entity.has(target)) continue;

    const key =
      id < target
        ? [id, target].join(KEY_SEPARATOR)
        : [target, id].join(KEY_SEPARATOR);
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({ dependent: id, target });
  }

  return pairs;
}

/**
 * Resolves the order the groups of an entity's variables must be generated in,
 * and reports the reference structures no data can satisfy.
 *
 * Once comparators are canonicalised and every variable id is mapped to its
 * `sameAs` group, a structure is unsatisfiable exactly when:
 *
 * 1. a cycle made only of comparator edges contains at least one strict edge.
 *    An all-non-strict cycle merely forces its members equal, which any single
 *    value satisfies.
 * 2. a comparator edge whose ends fall in one `sameAs` group is strict. The
 *    group holds one value, which cannot be strictly ordered against itself,
 *    but does satisfy a non-strict comparison.
 * 3. a `differentFrom` falls within one `sameAs` group, whose members would
 *    have to be equal and different at once.
 *
 * `differentFrom` never makes a cycle unsatisfiable on its own: being
 * symmetric, a mutual pair is one constraint that any two distinct values
 * satisfy. It still wants an ordering edge — generate the target, then avoid
 * its value — so one is retained whenever it cannot close a cycle, and dropped
 * when it can.
 */
export function resolveGenerationOrder(
  entity: EntityConstraints,
): GenerationOrder {
  const { groupOf, membersOf } = buildSameAsGroups(entity);
  const groups = [...new Set([...entity.keys()].map((id) => groupOf.get(id)!))];

  const cycles: string[][] = [];
  const reported = new Set<string>();

  const report = (groupsInCycle: string[]): void => {
    // Sorting canonicalises the dedupe key only; both the reported members and
    // the generation order stay in traversal order. `flatMap` allocates, so a
    // consumer that reorders a reported cycle cannot disturb `membersOf`.
    const key = groupsInCycle.toSorted().join(KEY_SEPARATOR);
    if (reported.has(key)) return;
    reported.add(key);
    cycles.push(groupsInCycle.flatMap((group) => membersOf.get(group) ?? []));
  };

  // Group edge (dependent group -> depended-upon group), strict when any of
  // the variable-level edges it collapses is strict.
  const comparatorDependencies = new Map<string, Map<string, boolean>>();
  for (const group of groups) comparatorDependencies.set(group, new Map());

  for (const edge of canonicalComparatorEdges(entity)) {
    const upper = groupOf.get(edge.upper)!;
    const lower = groupOf.get(edge.lower)!;

    if (upper === lower) {
      if (edge.strict) report([upper]);
      continue;
    }

    const dependencies = comparatorDependencies.get(upper)!;
    dependencies.set(lower, edge.strict || dependencies.get(lower) === true);
  }

  const retained = new Map<string, Set<string>>();
  for (const group of groups) retained.set(group, new Set());

  const state = new Map<string, 'visiting' | 'done'>();

  const visitComparators = (group: string, stack: string[]): void => {
    const current = state.get(group);
    if (current === 'done') return;
    if (current === 'visiting') {
      const start = stack.indexOf(group);
      const cycle = stack.slice(start === -1 ? 0 : start);
      const hasStrictEdge = cycle.some(
        (from, index) =>
          comparatorDependencies.get(from)?.get(cycle[index + 1] ?? group) ===
          true,
      );
      if (hasStrictEdge) report(cycle);
      return;
    }

    state.set(group, 'visiting');
    for (const dependency of comparatorDependencies.get(group)!.keys()) {
      visitComparators(dependency, [...stack, group]);
      // A dependency left 'visiting' is an ancestor, so this edge closed a
      // cycle; dropping it leaves an acyclic graph to order.
      if (state.get(dependency) === 'done')
        retained.get(group)!.add(dependency);
    }
    state.set(group, 'done');
  };

  for (const group of groups) visitComparators(group, []);

  const reaches = (from: string, target: string): boolean => {
    const seen = new Set<string>([from]);
    const pending = [from];
    while (pending.length > 0) {
      const group = pending.pop()!;
      if (group === target) return true;
      for (const dependency of retained.get(group) ?? []) {
        if (seen.has(dependency)) continue;
        seen.add(dependency);
        pending.push(dependency);
      }
    }
    return false;
  };

  for (const pair of differentFromPairs(entity)) {
    const dependent = groupOf.get(pair.dependent)!;
    const target = groupOf.get(pair.target)!;

    if (dependent === target) {
      report([dependent]);
      continue;
    }

    if (reaches(target, dependent)) continue;
    retained.get(dependent)!.add(target);
  }

  const order: string[] = [];
  const placed = new Set<string>();

  const place = (group: string): void => {
    if (placed.has(group)) return;
    placed.add(group);
    for (const dependency of retained.get(group)!) place(dependency);
    order.push(group);
  };

  for (const group of groups) place(group);

  return { order, membersOf, groupOf, cycles };
}
