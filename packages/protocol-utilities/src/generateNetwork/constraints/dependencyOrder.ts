import { COMPARISON_RULES, type EntityConstraints } from './types';

export type GenerationOrder = {
  /** Group representative ids, in the order they must be generated. */
  order: string[];
  /** Member ids keyed by their group's representative id. */
  membersOf: Map<string, string[]>;
  /** Representative id keyed by member id. */
  groupOf: Map<string, string>;
  /** Unsatisfiable reference cycles, as lists of variable ids. Empty when none. */
  cycles: string[][];
};

/**
 * `sameAs` is symmetric and transitive in effect — every member of a chain
 * ends up holding one value — so those variables merge into a single group
 * that generates once. Comparator and `differentFrom` references are
 * directional and become edges between groups.
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

function directedTargets(entity: EntityConstraints, id: string): string[] {
  const { constraints } = entity.get(id)!;
  const targets: string[] = [];

  if (constraints.differentFrom !== undefined) {
    targets.push(constraints.differentFrom);
  }
  for (const rule of COMPARISON_RULES) {
    const target = constraints[rule];
    if (target !== undefined) targets.push(target);
  }

  return targets.filter((target) => entity.has(target));
}

export function resolveGenerationOrder(
  entity: EntityConstraints,
): GenerationOrder {
  const { groupOf, membersOf } = buildSameAsGroups(entity);

  const groups = [...new Set([...entity.keys()].map((id) => groupOf.get(id)!))];
  const dependencies = new Map<string, Set<string>>();
  for (const group of groups) dependencies.set(group, new Set());

  for (const id of entity.keys()) {
    const from = groupOf.get(id)!;
    for (const target of directedTargets(entity, id)) {
      const to = groupOf.get(target)!;
      if (to !== from) dependencies.get(from)!.add(to);
    }
  }

  const order: string[] = [];
  const state = new Map<string, 'visiting' | 'done'>();
  const cycles: string[][] = [];

  const visit = (group: string, stack: string[]): void => {
    const current = state.get(group);
    if (current === 'done') return;
    if (current === 'visiting') {
      const start = stack.indexOf(group);
      const groupsInCycle = stack.slice(start === -1 ? 0 : start);
      cycles.push(groupsInCycle.flatMap((g) => membersOf.get(g) ?? []));
      return;
    }

    state.set(group, 'visiting');
    for (const dependency of dependencies.get(group)!) {
      visit(dependency, [...stack, group]);
    }
    state.set(group, 'done');
    order.push(group);
  };

  for (const group of groups) visit(group, []);

  // A sameAs group that also holds a directional reference to itself is a
  // contradiction the group merge hides: the members must be equal AND ordered.
  for (const id of entity.keys()) {
    const from = groupOf.get(id)!;
    for (const target of directedTargets(entity, id)) {
      if (groupOf.get(target) === from) {
        cycles.push(membersOf.get(from) ?? []);
      }
    }
  }

  return { order, membersOf, groupOf, cycles };
}
