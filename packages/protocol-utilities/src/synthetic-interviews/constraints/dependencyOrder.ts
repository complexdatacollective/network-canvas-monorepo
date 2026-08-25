import {
  COMPARATOR_DIRECTION,
  COMPARISON_RULES,
  type EntityConstraints,
} from './types';

export type GenerationOrder = {
  /**
   * Group representative ids, in the order they must be generated. Whenever
   * `cycles` is empty this is a valid topological order: every group is listed
   * after every group it depends on. When `cycles` is not empty each group is
   * still listed exactly once, but the contradicting groups cannot be ordered
   * against one another and their relative positions are arbitrary.
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
export type ComparatorEdge = {
  lower: string;
  upper: string;
  strict: boolean;
};

type DifferentFromPair = {
  dependent: string;
  target: string;
};

/**
 * Comparator edges lifted to groups, as `dependent -> dependency -> strict`.
 * The dependent group is bounded by the dependency's value, so the dependency
 * generates first. `strict` is true when any variable-level edge collapsed into
 * the group edge forbids the two values being equal. Edges whose ends share a
 * group are kept as self-loops, because a strict one is a claim that a single
 * value is greater than itself.
 */
type ComparatorGraph = Map<string, Map<string, boolean>>;

type EqualityClasses = {
  find: (id: string) => string;
  union: (a: string, b: string) => void;
};

// Variable ids never contain a NUL, so joining on one cannot collide.
export const KEY_SEPARATOR = '\u0000';

function createEqualityClasses(ids: readonly string[]): EqualityClasses {
  const parent = new Map<string, string>();
  for (const id of ids) parent.set(id, id);

  const find = (id: string): string => {
    let root = id;
    let above = parent.get(root);
    while (above !== undefined && above !== root) {
      root = above;
      above = parent.get(root);
    }

    let cursor = id;
    while (cursor !== root) {
      const next = parent.get(cursor) ?? root;
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

  return { find, union };
}

/**
 * Rewrites all four comparators into the single `{ lower, upper, strict }`
 * direction and dedupes the result, so one constraint written from both sides
 * ("end after start" plus "start before end") collapses to one edge instead of
 * looking like a cycle.
 */
export function canonicalComparatorEdges(
  entity: EntityConstraints,
): ComparatorEdge[] {
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

function buildComparatorGraph(
  edges: readonly ComparatorEdge[],
  groupOf: (id: string) => string,
): ComparatorGraph {
  const graph: ComparatorGraph = new Map();

  for (const edge of edges) {
    const dependent = groupOf(edge.upper);
    const dependency = groupOf(edge.lower);
    const targets = graph.get(dependent) ?? new Map<string, boolean>();
    targets.set(dependency, edge.strict || targets.get(dependency) === true);
    graph.set(dependent, targets);
  }

  return graph;
}

/**
 * Kosaraju's algorithm. The first walk records the order nodes finish in, the
 * second walks the reversed edges starting from the latest finisher, and every
 * tree it collects is one strongly connected component.
 */
function stronglyConnectedComponents(
  nodes: readonly string[],
  graph: ComparatorGraph,
): string[][] {
  const finished: string[] = [];
  const visited = new Set<string>();

  const explore = (node: string): void => {
    if (visited.has(node)) return;
    visited.add(node);
    for (const next of graph.get(node)?.keys() ?? []) explore(next);
    finished.push(node);
  };

  for (const node of nodes) explore(node);

  const incoming = new Map<string, string[]>();
  for (const [node, targets] of graph) {
    for (const target of targets.keys()) {
      const sources = incoming.get(target) ?? [];
      sources.push(node);
      incoming.set(target, sources);
    }
  }

  const assigned = new Set<string>();
  const components: string[][] = [];

  const collect = (node: string, component: string[]): void => {
    if (assigned.has(node)) return;
    assigned.add(node);
    component.push(node);
    for (const source of incoming.get(node) ?? []) collect(source, component);
  };

  for (const node of finished.toReversed()) {
    if (assigned.has(node)) continue;
    const component: string[] = [];
    collect(node, component);
    components.push(component);
  }

  return components;
}

function hasStrictInternalEdge(
  component: readonly string[],
  graph: ComparatorGraph,
): boolean {
  const members = new Set(component);

  for (const node of component) {
    for (const [target, strict] of graph.get(node) ?? []) {
      if (strict && members.has(target)) return true;
    }
  }

  return false;
}

/**
 * Resolves the order the groups of an entity's variables must be generated in,
 * and reports the reference structures no data can satisfy.
 *
 * Variables merge into groups that generate one shared value. `sameAs` forms
 * the first groups, but it is not the only construct that forces two variables
 * equal: within a cycle of comparator edges every member bounds every other
 * from both sides, so a cycle carrying no strict edge forces its members equal
 * — `a >= b` together with `b >= a` means `a = b`. Such a cycle is not a
 * contradiction, it is an equality class, and merging it is what makes the
 * generator emit one value for all of its members, which is the only thing
 * that satisfies it.
 *
 * Finding those cycles is a strongly-connected-components problem rather than
 * a back-edge search: a depth-first search examines one cycle per back edge, so
 * a strict cycle sharing a back edge with an all-non-strict one is never
 * looked at. Taking a whole component at once is both sound and complete — a
 * component with no internal strict edge is an equality class, and a component
 * carrying any internal strict edge contains a cycle implying `x > x`.
 *
 * Once every equality class is merged, a structure is unsatisfiable exactly
 * when:
 *
 * 1. a component of the comparator graph has an internal strict edge. A
 *    comparator whose two ends already share a group counts as one, because
 *    that group holds a single value which cannot be strictly ordered against
 *    itself (though it does satisfy a non-strict comparison).
 * 2. a `differentFrom` falls within one group, whose members would have to be
 *    equal and different at once.
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
  const ids = [...entity.keys()];
  const classes = createEqualityClasses(ids);

  for (const [id, variable] of entity) {
    const target = variable.constraints.sameAs;
    if (target !== undefined && entity.has(target)) classes.union(target, id);
  }

  const comparatorEdges = canonicalComparatorEdges(entity);

  const sameAsGroups = [...new Set(ids.map((id) => classes.find(id)))];
  const sameAsGraph = buildComparatorGraph(comparatorEdges, classes.find);

  const contradictions: string[][] = [];
  for (const component of stronglyConnectedComponents(
    sameAsGroups,
    sameAsGraph,
  )) {
    if (hasStrictInternalEdge(component, sameAsGraph)) {
      contradictions.push(component);
      continue;
    }

    const [representative, ...rest] = component;
    if (representative === undefined) continue;
    for (const group of rest) classes.union(representative, group);
  }

  // Membership is rebuilt from codebook order, so the order components were
  // discovered in does not reach the caller: the groups come out in the order
  // their first member is declared, and each member list in declaration order.
  // The representative keying a group is still union-find's root — for
  // `a sameAs b` it is `b` — which is deterministic for a given codebook and
  // always one of the group's own members, but is not the first of them.
  const groupOf = new Map<string, string>();
  const membersOf = new Map<string, string[]>();
  for (const id of ids) {
    const root = classes.find(id);
    groupOf.set(id, root);
    const members = membersOf.get(root) ?? [];
    members.push(id);
    membersOf.set(root, members);
  }
  const groups = [...membersOf.keys()];

  const cycles: string[][] = [];
  const reported = new Set<string>();

  const report = (groupsInCycle: readonly string[]): void => {
    // Sorting canonicalises the dedupe key only. The reported members are
    // gathered into a fresh array in codebook order, so a consumer that
    // reorders a reported cycle cannot disturb `membersOf`.
    const inCycle = new Set(groupsInCycle);
    const key = [...inCycle].toSorted().join(KEY_SEPARATOR);
    if (reported.has(key)) return;
    reported.add(key);
    cycles.push(ids.filter((id) => inCycle.has(groupOf.get(id) ?? id)));
  };

  for (const component of contradictions) report(component);

  const dependencies = new Map<string, Set<string>>();
  for (const group of groups) dependencies.set(group, new Set());

  for (const edge of comparatorEdges) {
    const dependent = classes.find(edge.upper);
    const dependency = classes.find(edge.lower);
    // Both ends now share a value, so there is nothing left to order.
    if (dependent === dependency) continue;
    dependencies.get(dependent)?.add(dependency);
  }

  const reaches = (from: string, target: string): boolean => {
    const seen = new Set<string>([from]);
    const pending = [from];
    while (pending.length > 0) {
      const group = pending.pop();
      if (group === undefined) break;
      if (group === target) return true;
      for (const dependency of dependencies.get(group) ?? []) {
        if (seen.has(dependency)) continue;
        seen.add(dependency);
        pending.push(dependency);
      }
    }
    return false;
  };

  for (const pair of differentFromPairs(entity)) {
    const dependent = classes.find(pair.dependent);
    const target = classes.find(pair.target);

    if (dependent === target) {
      report([dependent]);
      continue;
    }

    if (reaches(target, dependent)) continue;
    dependencies.get(dependent)?.add(target);
  }

  const order: string[] = [];
  const placed = new Set<string>();

  const place = (group: string): void => {
    if (placed.has(group)) return;
    placed.add(group);
    for (const dependency of dependencies.get(group) ?? []) place(dependency);
    order.push(group);
  };

  for (const group of groups) place(group);

  return { order, membersOf, groupOf, cycles };
}
