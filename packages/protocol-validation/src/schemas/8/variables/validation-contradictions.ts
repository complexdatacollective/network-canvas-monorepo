import type { ValidationName } from './validation.ts';
import { isIsoDate, isValidDateAtResolution } from './variable.ts';

type UnknownRecord = Record<string, unknown>;

export type ContradictionClass =
  | 'invertedBounds'
  | 'minSelectedExceedsOptions'
  | 'conflictingReferencePair'
  | 'strictComparatorCycle'
  | 'sameAsGroupConflict'
  | 'disjointBounds'
  | 'oddDifferentFromCycle'
  | 'pinnedEqualDifferentFrom';

export type VariableRuleRef = {
  variableId: string;
  rule: ValidationName;
};

export type ValidationContradiction = {
  class: ContradictionClass;
  message: string;
  /** Every variable participating in the contradiction. */
  variableIds: string[];
  /**
   * The rules the minimal-strip repair policy removes to resolve this
   * contradiction. The first entry anchors the Zod issue path.
   */
  strips: [VariableRuleRef, ...VariableRuleRef[]];
};

// All reads are defensive: the analyser runs inside Zod refinement (typed,
// parsed input) and inside the v7→v8 migration (raw, partially-migrated
// input), so nothing here may assume a well-formed variable.
const asRecord = (value: unknown): UnknownRecord | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;

const validationOf = (variable: unknown): UnknownRecord =>
  asRecord(asRecord(variable)?.validation) ?? {};

const nameOf = (id: string, variable: unknown): string => {
  const name = asRecord(variable)?.name;
  return typeof name === 'string' ? name : id;
};

const typeOf = (variable: unknown): string | undefined => {
  const type = asRecord(variable)?.type;
  return typeof type === 'string' ? type : undefined;
};

const numberRule = (
  variable: unknown,
  rule: ValidationName,
): number | undefined => {
  const value = validationOf(variable)[rule];
  return typeof value === 'number' ? value : undefined;
};

const referenceRule = (
  variable: unknown,
  rule: ValidationName,
): string | undefined => {
  const value = validationOf(variable)[rule];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

/**
 * A variable's distinct option values, for the `minSelected` cardinality
 * check below, the categorical/ordinal `sameAs`-group check (Finding D), and
 * the ordinal/categorical arms of `pinnedValue` (tenth-wave Finding 2).
 * `undefined` — not an empty set — means "unusable for this check": raw
 * migration input may not have an `options` array at all, and that must skip
 * the check rather than be treated as zero options. `categoricalOptionsSchema`
 * permits duplicate-VALUE entries (the runtime can only ever select a
 * distinct value), so this counts distinct values, not entries — sixth-wave
 * Finding 3.
 */
const optionValues = (variable: unknown): Set<string | number> | undefined => {
  const options = asRecord(variable)?.options;
  if (!Array.isArray(options)) return undefined;
  const values = new Set<string | number>();
  for (const option of options) {
    const value = asRecord(option)?.value;
    if (typeof value === 'string' || typeof value === 'number') {
      values.add(value);
    }
  }
  return values;
};

const BOUND_PAIRS = [
  ['minLength', 'maxLength'],
  ['minValue', 'maxValue'],
  ['minSelected', 'maxSelected'],
] as const satisfies readonly (readonly [ValidationName, ValidationName])[];

function localContradictions(
  variables: UnknownRecord,
): ValidationContradiction[] {
  const found: ValidationContradiction[] = [];
  for (const [id, variable] of Object.entries(variables)) {
    const name = nameOf(id, variable);
    for (const [minRule, maxRule] of BOUND_PAIRS) {
      const min = numberRule(variable, minRule);
      const max = numberRule(variable, maxRule);
      if (min !== undefined && max !== undefined && min > max) {
        found.push({
          class: 'invertedBounds',
          message: `Variable "${name}": ${minRule} (${min}) is greater than ${maxRule} (${max})`,
          variableIds: [id],
          strips: [
            { variableId: id, rule: minRule },
            { variableId: id, rule: maxRule },
          ],
        });
      }
    }
    const minSelected = numberRule(variable, 'minSelected');
    const options = optionValues(variable)?.size;
    if (
      minSelected !== undefined &&
      options !== undefined &&
      minSelected > options
    ) {
      found.push({
        class: 'minSelectedExceedsOptions',
        message: `Variable "${name}": minSelected (${minSelected}) is greater than the number of options (${options})`,
        variableIds: [id],
        strips: [{ variableId: id, rule: 'minSelected' }],
      });
    }
  }
  return found;
}

// Only ever used to join VARIABLE IDS, which `VariableNameSchema`
// (@codaco/shared-consts) restricts to /^[a-zA-Z0-9._:-]+$/ — no NUL, so those
// keys cannot collide. Unrestricted user data (categorical option values) is
// never joined on it; see the categorical arm of `pinnedValue`.
const KEY_SEPARATOR = '\u0000';

const stripKey = (ref: VariableRuleRef): string =>
  `${ref.variableId}${KEY_SEPARATOR}${ref.rule}`;

/**
 * A reference is usable for structural analysis only when its target exists
 * and has the same type as the source. Cross-type references are rejected
 * separately (R2, the reference pass) and their bounds are incomparable.
 */
const usableReference = (
  variables: UnknownRecord,
  sourceId: string,
  rule: ValidationName,
): string | undefined => {
  const target = referenceRule(variables[sourceId], rule);
  if (target === undefined) return undefined;
  if (!(target in variables)) return undefined;
  const sourceType = typeOf(variables[sourceId]);
  const targetType = typeOf(variables[target]);
  if (
    sourceType === undefined ||
    targetType === undefined ||
    sourceType !== targetType
  ) {
    return undefined;
  }
  return target;
};

const hasUsableSameAs = (variables: UnknownRecord, id: string): boolean =>
  usableReference(variables, id, 'sameAs') !== undefined;

/**
 * A pairwise conflict between two variables forced equal can arise either
 * directly from a `sameAs` edge or, since Finding E, transitively from a
 * non-strict comparator cycle. The message should name whichever mechanism
 * is actually in play. "Either participant carries a usable sameAs" is the
 * simplest deterministic signal for that: `usableReference` only ever unions
 * same-typed variables into an equality group, so if either named variable
 * has a usable `sameAs` at all, that edge is necessarily what put it in this
 * group (sameAs and the comparator SCCs are unioned into the same union-find,
 * but a variable's own `sameAs` edge is always toward its own group).
 */
const equalityRequirementClause = (
  variables: UnknownRecord,
  a: string,
  b: string,
): string =>
  hasUsableSameAs(variables, a) || hasUsableSameAs(variables, b)
    ? 'sameAs already requires them to be equal'
    : 'the comparison rules already require them to be equal';

/**
 * Same wording choice as `equalityRequirementClause`, phrased for a
 * multi-member group rather than a named pair.
 */
const groupEqualityDescription = (
  variables: UnknownRecord,
  members: string[],
): string =>
  members.some((member) => hasUsableSameAs(variables, member))
    ? 'are joined by sameAs'
    : 'are forced equal by the comparison rules';

type ComparatorEdge = {
  lower: string;
  upper: string;
  strict: boolean;
  sources: VariableRuleRef[];
};

const COMPARATOR_DIRECTION = {
  greaterThanVariable: { ownerIsUpper: true, strict: true },
  lessThanVariable: { ownerIsUpper: false, strict: true },
  greaterThanOrEqualToVariable: { ownerIsUpper: true, strict: false },
  lessThanOrEqualToVariable: { ownerIsUpper: false, strict: false },
} as const;

type ComparatorRuleName = keyof typeof COMPARATOR_DIRECTION;

const COMPARATOR_RULES: readonly ComparatorRuleName[] = [
  'greaterThanVariable',
  'lessThanVariable',
  'greaterThanOrEqualToVariable',
  'lessThanOrEqualToVariable',
];

/**
 * Rewrites all four comparators into the single `{ lower, upper, strict }`
 * direction and dedupes, so one constraint written from both sides ("end
 * after start" plus "start before end") collapses to one edge instead of
 * looking like a cycle. Every contributing rule instance is kept as a source
 * so a strip can name it.
 */
function comparatorEdges(variables: UnknownRecord): ComparatorEdge[] {
  const byKey = new Map<string, ComparatorEdge>();
  for (const id of Object.keys(variables)) {
    for (const rule of COMPARATOR_RULES) {
      const target = usableReference(variables, id, rule);
      if (target === undefined) continue;
      const { ownerIsUpper, strict } = COMPARATOR_DIRECTION[rule];
      const lower = ownerIsUpper ? target : id;
      const upper = ownerIsUpper ? id : target;
      const key = [lower, upper, String(strict)].join(KEY_SEPARATOR);
      const existing = byKey.get(key);
      if (existing) {
        existing.sources.push({ variableId: id, rule });
      } else {
        byKey.set(key, {
          lower,
          upper,
          strict,
          sources: [{ variableId: id, rule }],
        });
      }
    }
  }
  return [...byKey.values()];
}

/**
 * Strongly-connected components of a directed graph given as an adjacency map,
 * in Tarjan's own emission order (every component is emitted only after all
 * the components reachable from it). Eleventh-wave Finding 2: Tarjan runs with
 * an explicit frame stack rather than recursion — the analyser runs inside
 * protocol parsing AND the v7→v8 migration, so a large imported protocol must
 * not crash the import with a RangeError. The frames replay the recursive
 * visit order exactly (same neighbour order, same component emission order).
 *
 * Twenty-first-wave Finding 3 lifted this out of
 * `nonStrictComparatorComponents` so the group-level condensation the chained
 * bound propagation needs shares one non-recursive walk.
 */
function stronglyConnectedComponents(
  adjacency: Map<string, string[]>,
): string[][] {
  const index = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const components: string[][] = [];
  let counter = 0;

  type Frame = { node: string; neighbours: string[]; next: number };

  const strongconnect = (start: string): void => {
    const frames: Frame[] = [];
    const enter = (node: string): void => {
      index.set(node, counter);
      lowlink.set(node, counter);
      counter += 1;
      stack.push(node);
      onStack.add(node);
      frames.push({ node, neighbours: adjacency.get(node) ?? [], next: 0 });
    };
    enter(start);

    while (frames.length > 0) {
      const frame = frames[frames.length - 1];
      if (!frame) break;
      const { node } = frame;

      if (frame.next < frame.neighbours.length) {
        const next = frame.neighbours[frame.next];
        frame.next += 1;
        if (next === undefined) continue;
        if (!index.has(next)) {
          // Descend; `node`'s lowlink is folded in when this frame pops.
          enter(next);
        } else if (onStack.has(next)) {
          const nodeLow = lowlink.get(node);
          const nextIndex = index.get(next);
          if (nodeLow !== undefined && nextIndex !== undefined) {
            lowlink.set(node, Math.min(nodeLow, nextIndex));
          }
        }
        continue;
      }

      // Neighbours exhausted: emit if this node roots a component, then
      // return to the parent frame, folding this node's lowlink into it —
      // the same order as the recursive call returning.
      if (lowlink.get(node) === index.get(node)) {
        const component: string[] = [];
        for (;;) {
          const member = stack.pop();
          if (member === undefined) break;
          onStack.delete(member);
          component.push(member);
          if (member === node) break;
        }
        components.push(component);
      }
      frames.pop();
      const parent = frames[frames.length - 1];
      if (parent) {
        const parentLow = lowlink.get(parent.node);
        const nodeLow = lowlink.get(node);
        if (parentLow !== undefined && nodeLow !== undefined) {
          lowlink.set(parent.node, Math.min(parentLow, nodeLow));
        }
      }
    }
  };

  for (const node of adjacency.keys()) {
    if (!index.has(node)) strongconnect(node);
  }

  return components;
}

/**
 * Strongly-connected components of the non-strict canonical comparator
 * subgraph, treating each `{ lower, upper }` edge as directed lower→upper
 * ("lower is at most upper"). A component with more than one member is a set
 * of variables a non-strict comparator cycle forces to hold one shared value
 * — `a >= b` plus `b >= a` is the two-node case; a longer all-non-strict
 * chain back to its start is the same shape.
 */
function nonStrictComparatorComponents(edges: ComparatorEdge[]): string[][] {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.strict) continue;
    const list = adjacency.get(edge.lower) ?? [];
    list.push(edge.upper);
    adjacency.set(edge.lower, list);
    if (!adjacency.has(edge.upper)) adjacency.set(edge.upper, []);
  }
  return stronglyConnectedComponents(adjacency).filter(
    (component) => component.length > 1,
  );
}

// Union-find with path compression, shared by the merged equality-group
// builder below and the sameAs-component resolution pass (tenth-wave
// Finding 5).
const createUnionFind = (
  ids: Iterable<string>,
): { find: (id: string) => string; union: (a: string, b: string) => void } => {
  const parent = new Map<string, string>();
  for (const id of ids) parent.set(id, id);

  const find = (id: string): string => {
    let root = id;
    for (;;) {
      const next = parent.get(root);
      if (next === undefined || next === root) break;
      root = next;
    }
    let cursor = id;
    while (cursor !== root) {
      const next = parent.get(cursor);
      if (next === undefined) break;
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
};

/**
 * The equality groups a set of variables collapse into: the union of (a)
 * `sameAs` edges — symmetric and transitive, every chain member ends up
 * holding one value — and (b) strongly-connected components of the
 * non-strict comparator graph (Finding E), which force their members equal
 * the same way. Both sources feed one union-find so every downstream group
 * check (strict-comparator-in-group, differentFrom-in-group, interval and
 * option-set intersection) sees the combined membership. The datetime
 * resolution check is the one exception: it scopes to sameAs-connected
 * components, not these merged groups — see
 * `mixedResolutionSameAsContradictions` (tenth-wave Finding 5).
 */
function buildEqualityGroups(
  variables: UnknownRecord,
  edges: ComparatorEdge[],
): {
  groupOf: Map<string, string>;
  membersOf: Map<string, string[]>;
} {
  const { find, union } = createUnionFind(Object.keys(variables));

  for (const id of Object.keys(variables)) {
    const target = usableReference(variables, id, 'sameAs');
    if (target !== undefined) union(target, id);
  }

  for (const component of nonStrictComparatorComponents(edges)) {
    const [anchor] = component;
    if (anchor === undefined) continue;
    for (const member of component.slice(1)) union(anchor, member);
  }

  const groupOf = new Map<string, string>();
  const membersOf = new Map<string, string[]>();
  for (const id of Object.keys(variables)) {
    const root = find(id);
    groupOf.set(id, root);
    const members = membersOf.get(root) ?? [];
    members.push(id);
    membersOf.set(root, members);
  }

  return { groupOf, membersOf };
}

type GroupEdge = { strict: boolean; sources: VariableRuleRef[] };

/**
 * Cycles in the group-level comparator graph. An all-non-strict cycle merely
 * forces its members equal, which one value satisfies; only cycles containing
 * a strict edge are unsatisfiable and reported. Eleventh-wave Finding 2: the
 * DFS runs with an explicit frame stack rather than recursion (see
 * `nonStrictComparatorComponents`); the shared `path` array holds exactly the
 * groups the recursive version accumulated per-call, so reported cycle
 * orderings are unchanged.
 */
function findStrictCycles(
  dependencies: Map<string, Map<string, GroupEdge>>,
): { groups: string[]; sources: VariableRuleRef[] }[] {
  const results: { groups: string[]; sources: VariableRuleRef[] }[] = [];
  const reported = new Set<string>();
  const state = new Map<string, 'visiting' | 'done'>();

  const reportCycle = (target: string, path: string[]): void => {
    const start = path.indexOf(target);
    const cycle = path.slice(start === -1 ? 0 : start);
    const edges: GroupEdge[] = [];
    let hasStrict = false;
    for (let index = 0; index < cycle.length; index++) {
      const from = cycle[index];
      const to = cycle[(index + 1) % cycle.length];
      const edge =
        from !== undefined && to !== undefined
          ? dependencies.get(from)?.get(to)
          : undefined;
      if (edge) {
        edges.push(edge);
        if (edge.strict) hasStrict = true;
      }
    }
    if (hasStrict) {
      const key = cycle.toSorted().join(KEY_SEPARATOR);
      if (!reported.has(key)) {
        reported.add(key);
        results.push({
          groups: cycle,
          sources: edges.flatMap((edge) => edge.sources),
        });
      }
    }
  };

  type Frame = { group: string; dependencies: string[]; next: number };

  const visit = (root: string): void => {
    const path: string[] = [];
    const frames: Frame[] = [];
    const enter = (group: string): void => {
      state.set(group, 'visiting');
      path.push(group);
      frames.push({
        group,
        dependencies: [...(dependencies.get(group)?.keys() ?? [])],
        next: 0,
      });
    };
    enter(root);

    while (frames.length > 0) {
      const frame = frames[frames.length - 1];
      if (!frame) break;

      if (frame.next < frame.dependencies.length) {
        const dependency = frame.dependencies[frame.next];
        frame.next += 1;
        if (dependency === undefined) continue;
        const current = state.get(dependency);
        if (current === 'done') continue;
        if (current === 'visiting') {
          // Back-edge: `path` is the chain of currently-visiting groups from
          // the root down to `frame.group`, inclusive.
          reportCycle(dependency, path);
          continue;
        }
        enter(dependency);
        continue;
      }

      state.set(frame.group, 'done');
      frames.pop();
      path.pop();
    }
  };

  for (const group of dependencies.keys()) {
    if (state.get(group) === undefined) visit(group);
  }
  return results;
}

type GroupGraph = {
  edges: ComparatorEdge[];
  groupOf: Map<string, string>;
  membersOf: Map<string, string[]>;
  /**
   * The group-level comparator dependency graph, keyed upper group → lower
   * group (an upper "depends on" the lower it must exceed). Parallel edges
   * between one pair of groups are merged: strictness is the OR of theirs, and
   * every contributing rule instance is kept so a strip can name it.
   */
  dependencies: Map<string, Map<string, GroupEdge>>;
  /**
   * Comparator edges whose two ends fall inside ONE equality group, in the
   * canonical edge order. A strict one is a `sameAsGroupConflict`; a
   * non-strict one is what a comparator-forced group's emptiness repair
   * strips.
   */
  internalEdges: ComparatorEdge[];
};

/**
 * The equality groups and their comparator dependency graph — the one
 * structure the reference-structure pass (strict cycles, in-group conflicts)
 * and the bound-disjointness pass (group intervals, chained propagation) both
 * read. Twenty-first-wave Finding 3 extracted it: the two passes used to build
 * the same graph twice from the same inputs, and the chained propagation needs
 * exactly the dependency map the cycle check already had.
 */
function buildGroupGraph(variables: UnknownRecord): GroupGraph {
  const edges = comparatorEdges(variables);
  const { groupOf, membersOf } = buildEqualityGroups(variables, edges);

  const dependencies = new Map<string, Map<string, GroupEdge>>();
  const internalEdges: ComparatorEdge[] = [];
  for (const edge of edges) {
    const upper = groupOf.get(edge.upper);
    const lower = groupOf.get(edge.lower);
    if (upper === undefined || lower === undefined) continue;
    if (upper === lower) {
      internalEdges.push(edge);
      continue;
    }
    let bucket = dependencies.get(upper);
    if (!bucket) {
      bucket = new Map();
      dependencies.set(upper, bucket);
    }
    const existing = bucket.get(lower);
    if (existing) {
      existing.strict = existing.strict || edge.strict;
      existing.sources.push(...edge.sources);
    } else {
      bucket.set(lower, { strict: edge.strict, sources: [...edge.sources] });
    }
  }

  return { edges, groupOf, membersOf, dependencies, internalEdges };
}

function referenceStructureContradictions(
  variables: UnknownRecord,
): ValidationContradiction[] {
  const found: ValidationContradiction[] = [];
  const claimed = new Set<string>();

  // Class 7: sameAs + differentFrom naming one target. Checked on raw values
  // (no usability guard) — the pair is contradictory regardless of the
  // target's type or existence.
  for (const [id, variable] of Object.entries(variables)) {
    const sameAs = referenceRule(variable, 'sameAs');
    const differentFrom = referenceRule(variable, 'differentFrom');
    if (sameAs === undefined || sameAs !== differentFrom) continue;
    const targetName = nameOf(sameAs, variables[sameAs]);
    const strips: [VariableRuleRef, VariableRuleRef] = [
      { variableId: id, rule: 'sameAs' },
      { variableId: id, rule: 'differentFrom' },
    ];
    found.push({
      class: 'conflictingReferencePair',
      message: `Variable "${nameOf(id, variable)}": sameAs and differentFrom both reference "${targetName}"`,
      variableIds: id === sameAs ? [id] : [id, sameAs],
      strips,
    });
    for (const strip of strips) claimed.add(stripKey(strip));
  }

  const { groupOf, membersOf, dependencies, internalEdges } =
    buildGroupGraph(variables);

  // A comparator edge whose ends fall inside one group is a class-9 conflict
  // when strict.
  for (const edge of internalEdges) {
    if (!edge.strict) continue;
    const upper = groupOf.get(edge.upper);
    if (upper === undefined) continue;
    const [first, ...rest] = edge.sources;
    if (!first) continue;
    const ownerName = nameOf(first.variableId, variables[first.variableId]);
    const otherId = first.variableId === edge.upper ? edge.lower : edge.upper;
    const message =
      edge.lower === edge.upper
        ? `Variable "${ownerName}": ${first.rule} references the variable itself`
        : `Variable "${ownerName}": ${first.rule} references "${nameOf(otherId, variables[otherId])}", but ${equalityRequirementClause(variables, first.variableId, otherId)}`;
    found.push({
      class: 'sameAsGroupConflict',
      message,
      variableIds: membersOf.get(upper) ?? [first.variableId],
      strips: [first, ...rest],
    });
  }

  // Class 9: differentFrom joining two members of one sameAs group (or the
  // variable itself — the group-of-one case). Skipped when class 7 already
  // claimed the same rule instance.
  for (const [id, variable] of Object.entries(variables)) {
    const target = usableReference(variables, id, 'differentFrom');
    if (target === undefined) continue;
    if (groupOf.get(id) !== groupOf.get(target)) continue;
    const ref: VariableRuleRef = { variableId: id, rule: 'differentFrom' };
    if (claimed.has(stripKey(ref))) continue;
    const group = groupOf.get(id);
    const message =
      id === target
        ? `Variable "${nameOf(id, variable)}": differentFrom references the variable itself`
        : `Variable "${nameOf(id, variable)}": differentFrom references "${nameOf(target, variables[target])}", but ${equalityRequirementClause(variables, id, target)}`;
    found.push({
      class: 'sameAsGroupConflict',
      message,
      variableIds: (group !== undefined && membersOf.get(group)) || [id],
      strips: [ref],
    });
  }

  // Class 8: strict comparator cycles across groups.
  for (const cycle of findStrictCycles(dependencies)) {
    const memberIds = cycle.groups.flatMap(
      (group) => membersOf.get(group) ?? [],
    );
    const memberNames = memberIds.map(
      (memberId) => `"${nameOf(memberId, variables[memberId])}"`,
    );
    const [first, ...rest] = cycle.sources;
    if (!first) continue;
    found.push({
      class: 'strictComparatorCycle',
      message: `Variables ${memberNames.join(', ')} form an impossible comparison cycle`,
      variableIds: memberIds,
      strips: [first, ...rest],
    });
  }

  return found;
}

/**
 * What an interval's bounds are measured against. Fourteenth-wave Finding 1:
 * most bounds are absolute quantities (a count, a length, a calendar day
 * number) and share the single implicit `'fixed'` origin. An anchorless
 * RelativeDatePicker's bounds are day OFFSETS from the interview date, which
 * is unknown at validation time but IDENTICAL for every such picker in a
 * protocol — so those bounds are real and mutually comparable, just not
 * against a calendar.
 *
 * Fifteenth-wave Finding 1: the two origins are tracked side by side rather
 * than collapsed. A group carries one interval PER origin present among its
 * members (see `GroupIntervals`), so a member on one origin neither corrupts
 * nor erases the bounds of the origin it says nothing about.
 */
type IntervalOrigin = 'fixed' | 'interviewDate';

type Interval = { min?: number; max?: number; origin: IntervalOrigin };

const DATE_PART_PATTERN = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/;

// Both helpers below build via `new Date(0)` + `setUTCFullYear` rather than
// `Date.UTC(year, ...)`: Date.UTC (like the multi-arg Date constructor) maps
// a 0-99 year into 1900-1999, which would silently corrupt a real four-digit
// year like '0099'; setUTCFullYear has no such two-digit-year special case.
const utcDayNumber = (
  year: number,
  monthIndex: number,
  day: number,
): number => {
  const date = new Date(0);
  date.setUTCFullYear(year, monthIndex, day);
  return date.getTime() / 86_400_000;
};

// Day 0 of the following month is the last day of `month` (1-based).
const lastDayOfMonth = (year: number, month: number): number => {
  const date = new Date(0);
  date.setUTCFullYear(year, month, 0);
  return date.getUTCDate();
};

/**
 * A date bound as a UTC day number. A partial date expands to the earliest day
 * of its period for a `min` bound and the latest for a `max` bound.
 *
 * The `max` expansion models "the latest day the control can EMIT", which is
 * only right when the control stores full dates. A coarse (month/year) picker
 * stores the truncated string, which `compareVariables` reads back as the
 * START of the period — see `dateWindowInterval`, which is the only caller
 * that has to make that distinction.
 */
const dayNumber = (value: string, edge: 'min' | 'max'): number | undefined => {
  const match = DATE_PART_PATTERN.exec(value);
  if (!match?.[1]) return undefined;
  const year = Number(match[1]);
  const month =
    match[2] !== undefined ? Number(match[2]) : edge === 'min' ? 1 : 12;
  const day =
    match[3] !== undefined
      ? Number(match[3])
      : edge === 'min'
        ? 1
        : lastDayOfMonth(year, month);
  return utcDayNumber(year, month - 1, day);
};

// RelativeDatePicker's own defaults when `before`/`after` are omitted (see
// the interview runtime's RelativeDatePicker component): 180 days before the
// anchor, 0 days after it.
const RELATIVE_DATE_PICKER_DEFAULT_BEFORE = 180;
const RELATIVE_DATE_PICKER_DEFAULT_AFTER = 0;

/**
 * A RelativeDatePicker's selectable window. An author-pinned `anchor` (a valid
 * ISO date) makes the window exactly as static as a DatePicker's own min/max:
 * `[anchor - before, anchor + after]` in days, on the fixed calendar origin
 * (fifth-wave Finding 3).
 *
 * Fourteenth-wave Finding 1 corrects what an ABSENT anchor means. The fifth
 * wave returned `undefined` for it, reading "the interview date is unknown at
 * validation time" as "no bounds at all". That is right for ABSOLUTE bounds —
 * an anchorless picker can never be compared against a calendar window — but
 * wrong for RELATIVE ones: the interview runtime resolves EVERY anchorless
 * picker in a form against the same `todayYmd()` (see the interview package's
 * `useProtocolForm` and fresco-ui's `RelativeDatePicker`), so two anchorless
 * pickers are pinned to the same day whenever their offsets say so, for every
 * possible interview date. Such a window is therefore reported on the symbolic
 * `'interviewDate'` origin, with its bounds expressed as day offsets; only
 * intervals sharing an origin are ever compared, so protocol validity stays
 * independent of when the interview actually runs.
 *
 * An anchor that IS a string but not a valid ISO date stays excluded: the
 * runtime forwards such a string verbatim into its date arithmetic rather than
 * falling back to the interview date, so neither origin models it.
 */
const relativeDateWindowInterval = (
  parameters: UnknownRecord,
): Interval | undefined => {
  const before =
    typeof parameters.before === 'number'
      ? parameters.before
      : RELATIVE_DATE_PICKER_DEFAULT_BEFORE;
  const after =
    typeof parameters.after === 'number'
      ? parameters.after
      : RELATIVE_DATE_PICKER_DEFAULT_AFTER;
  if (typeof parameters.anchor !== 'string') {
    return { min: -before, max: after, origin: 'interviewDate' };
  }
  if (!isIsoDate(parameters.anchor)) return undefined;
  // `anchor` is a full YYYY-MM-DD ISO date, so 'min' vs 'max' expansion is
  // moot — both edges resolve to the same single day.
  const anchor = dayNumber(parameters.anchor, 'min');
  if (anchor === undefined) return undefined;
  return { min: anchor - before, max: anchor + after, origin: 'fixed' };
};

const RELATIVE_DATE_PICKER_PARAMETER_KEYS = [
  'anchor',
  'before',
  'after',
] as const;
const DATE_PICKER_PARAMETER_KEYS = ['type', 'min', 'max'] as const;

/**
 * Eighteenth-wave Finding 3, mirroring the componentless-DatePicker inference
 * `dateResolutionOf` already makes for resolution. `component` is OPTIONAL on
 * the RelativeDatePicker datetime member too (variable.ts's
 * `dateTimeRelativeDatePickerSchema`), so a schema-valid variable can declare
 * an anchor/before/after window while leaving the component to the stage that
 * renders it (a NetworkComposer field inherits the codebook parameter record
 * via `fieldParameters ?? codebookParameters`). Such a variable used to fall
 * through to the DatePicker reading below, which finds no min/max and so
 * contributes NO window at all — losing a window the author really did
 * declare, and with it the pinning that makes e.g. two fixed single-day
 * pickers joined by `differentFrom` unsatisfiable.
 *
 * The two members' parameters are disjoint strictObjects, so an
 * anchor/before/after key identifies the relative member unambiguously —
 * unless a type/min/max key is present too, in which case the record matches
 * neither member (the schema rejects it, and the analyser also runs over raw
 * migration input). No inference is safe then, so the pre-existing DatePicker
 * reading stands.
 *
 * Nineteenth-wave Finding 1: exported so the v7→v8 migration's codebook
 * datetime step routes a componentless variable to the same normaliser this
 * reading assumes.
 *
 * Audit sweep: an explicitly NULL member key is absent, not present. Architect
 * clears a parameter record by writing literal nulls rather than deleting keys
 * (`handleChangeComponent` in withFieldsHandlers), and redux-form keeps them,
 * so counting a null as present made e.g. `{ anchor, before, after, min: null }`
 * match neither shape — losing the relative window the author really declared.
 * The mixed-shape stand-off above is reserved for keys that are genuinely set.
 */
export const isRelativeDatePickerShape = (parameters: UnknownRecord): boolean =>
  RELATIVE_DATE_PICKER_PARAMETER_KEYS.some((key) => parameters[key] != null) &&
  !DATE_PICKER_PARAMETER_KEYS.some((key) => parameters[key] != null);

type DateResolution = 'full' | 'month' | 'year';

/**
 * A datetime variable's storage resolution, for the max edge of
 * `dateWindowInterval` below (twentieth-wave Finding 1), the mixed-resolution
 * sameAs-component check (third-wave Finding 3, rescoped by tenth-wave
 * Finding 5) and the coarse arm of `pinnedValue`. Only a DatePicker's own
 * `parameters.type` can coarsen it to 'month'/'year' — a RelativeDatePicker
 * always stores a full date, so it defaults to 'full'.
 *
 * Seventeenth-wave Finding 2 corrects what an ABSENT `component` means. It
 * used to fall in with RelativeDatePicker on "no component configured yet has
 * no resolution of its own", but `component` is OPTIONAL on the DatePicker
 * datetime member (variable.ts's `dateTimeDatePickerSchema`), so a
 * schema-valid variable can omit it while still declaring
 * `parameters: { type: 'year' }`. Reading that as full resolution discarded a
 * resolution the author really did declare — and one a NetworkComposer field
 * inherits when it re-declares only the component (see `schema.ts`'s
 * `validateComposerFieldContradictions`) — so a `sameAs` with an explicit year
 * picker was falsely rejected. A `{ type }` parameter shape identifies a
 * DatePicker unambiguously: the RelativeDatePicker member's parameters are a
 * strictObject of anchor/before/after and cannot carry `type`. Parameters that
 * are absent or carry no recognised `type` still mean 'full', and a variable
 * that DOES declare a component is unaffected.
 *
 * Audit sweep: "absent" has to include an explicit NULL. Picking a
 * componentless codebook variable in Architect's field editor writes
 * `component: null` (`handleChangeVariable` in withFieldsHandlers) and
 * `buildProspectiveVariables` layers that null onto the variable it hands this
 * analyser, so an `=== undefined` test scored the null as "some component
 * other than DatePicker" and discarded a declared `{ type: 'year' }` — the
 * very false rejection this reading exists to prevent.
 */
const dateResolutionOf = (variable: unknown): DateResolution => {
  const record = asRecord(variable);
  if (record === null) return 'full';
  if (record.component != null && record.component !== 'DatePicker') {
    return 'full';
  }
  const type = asRecord(record.parameters)?.type;
  return type === 'month' || type === 'year' ? type : 'full';
};

/**
 * Twentieth-wave Finding 1: the interval a DatePicker's own min/max bounds
 * describe, as the convex hull of the INSTANTS `compareVariables` derives from
 * the values the control can store — not of the days the control can display.
 *
 * The two differ only at the max edge of a COARSE picker. A month/year picker
 * stores the truncated string ('2020', '2020-05'), and every comparator rule
 * resolves it with `new Date(stored)` (fresco-ui's `compareVariables`), which
 * reads a bare year as 1 January and a bare month as the 1st — the START of
 * the period, never the end. Expanding a coarse `max` to its period end
 * therefore modelled instants the variable can never hold: a year picker
 * pinned to '2020' with `greaterThanVariable` a full picker pinned to
 * '2020-06-01' was accepted although every runtime comparison fails. Earlier
 * waves declined this twice as "conservative", but a later wave began pinning
 * coarse dates to their stored string for equality/`differentFrom`
 * (seventeenth-wave Finding 1), leaving the analyser modelling one variable
 * two different ways; the stored instant is the reading both checks share.
 * `[Jan 1 of minYear, Jan 1 of maxYear]` is still a superset of the coarse
 * picker's discrete emissions — just the tightest one — so the model stays
 * sound for both the group-intersection and comparator-feasibility consumers.
 *
 * The period-end expansion is kept for a FULL-resolution picker carrying a
 * coarse bound string. `datePickerParametersSchema` rejects that pairing, so
 * it only reaches the analyser as raw (pre-schema) migration input — where the
 * control genuinely can emit any day up to the end of the period.
 *
 * The min edge is the period start at every resolution, which is already both
 * the earliest emittable day and the coarse stored instant.
 */
const dateWindowInterval = (variable: unknown): Interval | undefined => {
  const record = asRecord(variable);
  if (!record) return undefined;
  const parameters = asRecord(record.parameters);
  if (!parameters) return undefined;
  // Audit sweep: a null `component` is an absent one (see `dateResolutionOf`),
  // and testing `=== undefined` here dropped the shape inference entirely,
  // losing the relative window rather than merely mis-reading it.
  if (
    record.component === 'RelativeDatePicker' ||
    (record.component == null && isRelativeDatePickerShape(parameters))
  ) {
    return relativeDateWindowInterval(parameters);
  }
  const min =
    typeof parameters.min === 'string'
      ? dayNumber(parameters.min, 'min')
      : undefined;
  const storesFullDates = dateResolutionOf(variable) === 'full';
  const max =
    typeof parameters.max === 'string'
      ? dayNumber(parameters.max, storesFullDates ? 'max' : 'min')
      : undefined;
  if (min === undefined && max === undefined) return undefined;
  return { min, max, origin: 'fixed' };
};

const intervalOf = (variable: unknown): Interval | undefined => {
  switch (typeOf(variable)) {
    case 'number':
      return {
        min: numberRule(variable, 'minValue'),
        max: numberRule(variable, 'maxValue'),
        origin: 'fixed',
      };
    case 'text':
      return {
        min: numberRule(variable, 'minLength'),
        max: numberRule(variable, 'maxLength'),
        origin: 'fixed',
      };
    case 'categorical':
      return {
        min: numberRule(variable, 'minSelected'),
        max: numberRule(variable, 'maxSelected'),
        origin: 'fixed',
      };
    case 'datetime':
      return dateWindowInterval(variable);
    default:
      return undefined;
  }
};

/**
 * Bounds only intersect meaningfully on a shared origin, so `intersect` takes
 * two intervals already known to share one: an anchorless RelativeDatePicker's
 * interview-date offsets and a calendar day number have no known relationship
 * at validation time. Cross-origin combination is not an intersection at all —
 * see `addToGroupIntervals`, which files each origin separately.
 */
const intersect = (a: Interval, b: Interval): Interval => ({
  min:
    a.min === undefined
      ? b.min
      : b.min === undefined
        ? a.min
        : Math.max(a.min, b.min),
  max:
    a.max === undefined
      ? b.max
      : b.max === undefined
        ? a.max
        : Math.min(a.max, b.max),
  origin: a.origin,
});

const isEmptyInterval = (interval: Interval | undefined): boolean =>
  interval?.min !== undefined &&
  interval.max !== undefined &&
  interval.min > interval.max;

/**
 * An equality group's bounds, one interval per origin its members constrain.
 * Fifteenth-wave Finding 1: folding every member into a single interval made
 * one incomparable member (an anchorless RelativeDatePicker beside calendar
 * dates) discard bounds the other members genuinely shared — a group of a
 * fixed '2020-01-01', an anchorless picker and a fixed '2021-01-01' stopped
 * reporting its real fixed-origin conflict. Keeping the origins apart means
 * each is intersected only with same-origin members, and the group is
 * contradictory when ANY origin is left empty.
 */
type GroupIntervals = Map<IntervalOrigin, Interval>;

const addToGroupIntervals = (
  group: GroupIntervals,
  interval: Interval | undefined,
): void => {
  if (!interval) return;
  const existing = group.get(interval.origin);
  group.set(
    interval.origin,
    existing ? intersect(existing, interval) : interval,
  );
};

const hasEmptyOrigin = (group: GroupIntervals): boolean =>
  [...group.values()].some(isEmptyInterval);

/**
 * A boolean variable's effective domain, for the singleton-domain
 * `differentFrom` check (fifth-wave Finding 5). Only reached when the
 * variable's `component` is explicitly `'Boolean'` — see Twenty-first-wave
 * Finding 1 below for why every other case (Toggle, or no declared component
 * at all) short-circuits to the unrestricted two-value domain.
 *
 * Within that `'Boolean'` case, `booleanOptionsSchema` (variable.ts) permits
 * an `options` array exposing only one of {true, false} — unlike
 * `optionValues` above, ABSENT options data falls back to the full two-value
 * domain rather than being treated as unusable: an options-less choice
 * control renders fresco-ui's BooleanField Yes/No default, so the
 * unrestricted domain is the correct model.
 *
 * Thirteenth-wave Finding 2: an EXPLICITLY EMPTY array is different, and no
 * longer shares that fallback. BooleanField defaults its options only when
 * the prop is `undefined`, so `options: []` renders no buttons at all and
 * offers no value — modelling it as both values made the analyser reason
 * over values the runtime never exposes. The schema now rejects it outright;
 * this keeps the two layers agreeing on raw (pre-schema) migration input
 * too. A NON-empty array carrying no usable boolean value is malformed
 * rather than deliberately empty, so it keeps the two-value fallback.
 *
 * Audit sweep: `options` only describes the domain when the EFFECTIVE
 * component is the choice control. fresco-ui's ToggleField takes no `options`
 * prop at all, so a Toggle is unconditionally two-valued however the variable
 * is configured — and both layers that resolve a stage-effective variable
 * (schema.ts's composer overlay, and Architect's `buildProspectiveVariables`)
 * override `component` while keeping the codebook `options`, so a
 * Toggle-rendered boolean reaches here carrying an options list it never
 * renders. Reading it pinned that variable to a single value and made a
 * satisfiable `differentFrom` look unsatisfiable.
 *
 * Twenty-first-wave Finding 1 extends that same reasoning to the case the
 * audit sweep left standing: an ABSENT (or null) `component`, read at the
 * CODEBOOK layer, does NOT mean "the codebook default IS the rendering".
 * `rejectValidationContradictions` (variable.ts), chained directly onto
 * `VariablesSchema` / `EdgeVariablesSchema` / `EgoVariablesSchema`, runs
 * while parsing the codebook alone, with no `stages` in scope — so for a
 * componentless boolean it can never learn which control actually renders
 * it. And the control is NOT determined by the codebook: schema.ts's
 * `validateFormFieldVariable` rejects a variable used by any shared form
 * field (`AlterForm`, `AlterEdgeForm`, `EgoForm`, `NameGenerator`'s form,
 * `FamilyPedigree`'s `nodeConfig.form` — all built on `FormFieldSchema`)
 * unless the codebook itself declares an explicit `component`, so a
 * componentless boolean is renderable ONLY by a NetworkComposer field — and
 * `ComposerFormFieldSchema.component` is required and drawn from every
 * control `VARIABLE_TYPE_COMPONENTS['boolean']` lists (`Boolean` and
 * `Toggle`), independent of what the codebook declares, so the field's own
 * choice, not the codebook's `options`, is what a participant actually sees.
 * Pinning from `options` for a componentless variable therefore pinned a
 * domain the codebook cannot know: a protocol reproducing the reviewer's
 * report — two componentless singleton-`true` boolean node variables,
 * `differentFrom` between them, both rendered by NetworkComposer fields with
 * `component: 'Toggle'` — was confirmed rejected at `codebook.node.person.
 * variables.<id>.validation.differentFrom` even though `ToggleField`
 * (fresco-ui) takes no `options` prop and is unconditionally two-valued.
 *
 * An EXPLICIT `component: 'Boolean'` stays on the options-reading path: the
 * codebook has committed to the choice control, which DOES honour `options`,
 * so pinning from them is a rendering the codebook actually determines. A
 * NetworkComposer field is still free to override that to `Toggle`, but that
 * override is exactly what schema.ts's `validateComposerFieldContradictions`
 * stage-effective overlay exists to catch: it re-runs this analyser with the
 * composer field's own `component` overlaid on the codebook variable, and
 * with the codebook-level report now gone the overlay's own contradiction is
 * no longer suppressed as a duplicate of the (nonexistent) baseline one. So a
 * genuine Toggle-less singleton-boolean `differentFrom` pair (one whose only
 * renderer keeps `component: 'Boolean'`, explicitly or by inheriting the
 * codebook default) is still reported — just anchored at the field, not the
 * codebook rule, and only once a stage exists to supply the missing context.
 * A componentless pair used by no composer field at all renders nowhere, so
 * nothing is contradictory.
 */
const booleanDomain = (variable: unknown): Set<boolean> => {
  const record = asRecord(variable);
  if (record?.component !== 'Boolean') return new Set([true, false]);
  const options = record.options;
  if (!Array.isArray(options)) return new Set([true, false]);
  if (options.length === 0) return new Set();
  const domain = new Set<boolean>();
  for (const option of options) {
    const value = asRecord(option)?.value;
    if (typeof value === 'boolean') domain.add(value);
  }
  return domain.size > 0 ? domain : new Set([true, false]);
};

/**
 * The single runtime value a variable's OWN rules pin it to, if any —
 * sixth-wave Finding 2's generalisation of the fifth-wave singleton-boolean
 * check to every type a `differentFrom` edge can join. `undefined` means "not
 * pinned": the variable can still hold more than one value under its current
 * rules, so a `differentFrom` partner cannot be judged against it here.
 *
 *   - number: a `minValue`/`maxValue` window collapsed to one point
 *     (`minValue === maxValue`) pins that value.
 *   - boolean: `booleanDomain`'s existing singleton-`options` logic (the
 *     fifth-wave Finding 5 check, folded in here).
 *   - datetime: a min/max window collapsed to one point pins that day. At
 *     full resolution the value is a day number keyed by the window's origin
 *     (fourteenth-wave Finding 1) so an anchorless RelativeDatePicker's
 *     interview-date offset can only ever match another anchorless picker's,
 *     never a calendar day number.
 *
 *     Seventeenth-wave Finding 1: a COARSE (month/year) DatePicker with an
 *     equal min/max is pinned too. The sixth wave excluded it on the grounds
 *     that "every day in that month/year is still selectable", which is not
 *     what the runtime stores: a coarse picker stores the TRUNCATED string —
 *     'YYYY' at year resolution, 'YYYY-MM' at month (see `DATE_RESOLUTION` in
 *     variable.ts, and fresco-ui's DatePicker, whose year/month controls
 *     offer only the options its min/max admit and emit the bare year or
 *     `${year}-${month}`). With min === max exactly one option exists, and
 *     `differentFrom` compares stored values exactly (fresco-ui's
 *     `isMatchingValue`), so two such variables could never differ.
 *
 *     The pinned value is the stored STRING, tagged with the resolution
 *     rather than an origin — a coarse picker's window is always calendar
 *     ('fixed') — because that is precisely what the runtime compares: a year
 *     picker pinned to '2020' and a full picker pinned to '2020-01-01' hold
 *     different strings and CAN differ, so they must not share a key. The
 *     resolution tags are disjoint from the origin tags for the same reason.
 *   - ordinal (tenth-wave Finding 2): single-select, so a variable whose
 *     options expose exactly ONE distinct value (duplicate-value entries
 *     collapse, per `optionValues`) can only ever hold that value — and
 *     ordinal's validation pick includes `differentFrom` (see
 *     `ordinalValidations` in variable.ts), so the pairing is reachable. The
 *     pinned value is the genuine primitive.
 *   - categorical (tenth-wave Finding 2): a selection is a SET of distinct
 *     option values, so a `minSelected` rule at or above the distinct-value
 *     count forces selecting ALL of them — one possible answer (strictly
 *     above the count is its own `minSelectedExceedsOptions` class, but >=
 *     keeps this robust either way). The runtime compares categorical arrays
 *     as order-insensitive multisets (fresco-ui's isMatchingValue), so the
 *     pinned "value" is a canonical composite key over the distinct values,
 *     typeof-tagged like isMatchingValue's own keying, sorted, and JSON-framed
 *     so no option value can forge another set's key (seventeenth-wave
 *     Finding 3). Keys are only ever compared between same-typed endpoints
 *     (`usableReference`), so no type's pinned value can collide with
 *     another's. `maxSelected` is irrelevant here: it can only shrink
 *     the feasible set further (a maxSelected below minSelected is its own
 *     `invertedBounds` contradiction), never admit a second answer.
 *   - text/scalar/layout: no rule on these types ever collapses to one
 *     runtime value.
 */
const pinnedValue = (
  variable: unknown,
): string | number | boolean | undefined => {
  switch (typeOf(variable)) {
    case 'number': {
      const min = numberRule(variable, 'minValue');
      const max = numberRule(variable, 'maxValue');
      return min !== undefined && min === max ? min : undefined;
    }
    case 'boolean': {
      const domain = booleanDomain(variable);
      return domain.size === 1 ? [...domain][0] : undefined;
    }
    case 'datetime': {
      const resolution = dateResolutionOf(variable);
      if (resolution !== 'full') {
        const parameters = asRecord(asRecord(variable)?.parameters);
        const min = parameters?.min;
        // A bound that does not match the picker's own resolution is
        // malformed rather than pinning (the schema rejects it separately),
        // and the analyser also runs over raw migration input.
        if (
          typeof min !== 'string' ||
          min !== parameters?.max ||
          !isValidDateAtResolution(min, resolution)
        ) {
          return undefined;
        }
        return `datetime:${resolution}:${min}`;
      }
      const window = dateWindowInterval(variable);
      if (window?.min === undefined || window.min !== window.max) {
        return undefined;
      }
      // Origin-tagged like the categorical composite below: a symbolic
      // interview-date offset and a calendar day number are different values
      // even when the two numbers coincide (fourteenth-wave Finding 1).
      return `datetime:${window.origin}:${window.min}`;
    }
    case 'ordinal': {
      const values = optionValues(variable);
      return values?.size === 1 ? [...values][0] : undefined;
    }
    case 'categorical': {
      const values = optionValues(variable);
      const minSelected = numberRule(variable, 'minSelected');
      if (
        values === undefined ||
        values.size === 0 ||
        minSelected === undefined ||
        minSelected < values.size
      ) {
        return undefined;
      }
      // Seventeenth-wave Finding 3: JSON-encode each type-tagged pair and the
      // sorted token list, rather than joining the raw tokens on
      // KEY_SEPARATOR. Categorical option values are unrestricted strings
      // (`categoricalOptionsSchema`), so a value carrying the separator plus a
      // token prefix made two genuinely different sets encode identically —
      // e.g. {'x', 'y'} and the singleton {'x<SEP>string:y'} — and the pair was
      // falsely reported even though their runtime arrays differ in length.
      // JSON escapes both the separator and its own delimiters, so the
      // encoding is injective.
      const tokens = [...values]
        .map((value) => JSON.stringify([typeof value, String(value)]))
        .toSorted();
      return `categorical:${JSON.stringify(tokens)}`;
    }
    default:
      return undefined;
  }
};

/**
 * `differentFrom` edges (same-typed endpoints, per `usableReference`) whose
 * two ends are each individually pinned (`pinnedValue`) to the SAME runtime
 * value — unsatisfiable regardless of the rest of the validation graph, since
 * neither endpoint has any other value to fall back to. Checked per raw
 * `differentFrom` rule instance, directly between the two endpoint
 * VARIABLES — not at equality-group granularity, mirroring the fifth-wave
 * check this generalises. Self-references are skipped: those are already
 * reported as a class-9 `sameAsGroupConflict` (a group-of-one).
 *
 * Also returns the claimed variable-id pairs so `oddDifferentFromCycleContradictions`
 * can exclude them from its boolean bipartite graph — a pair already reported
 * here must not ALSO surface as (or be folded into) an odd-cycle report.
 */
function pinnedEqualDifferentFromContradictions(variables: UnknownRecord): {
  contradictions: ValidationContradiction[];
  claimedPairs: Set<string>;
} {
  const conflicts = new Map<string, VariableRuleRef[]>();

  for (const [id, variable] of Object.entries(variables)) {
    const target = usableReference(variables, id, 'differentFrom');
    if (target === undefined || target === id) continue;
    const valueA = pinnedValue(variable);
    const valueB = pinnedValue(variables[target]);
    if (valueA === undefined || valueB === undefined || valueA !== valueB) {
      continue;
    }
    const [lower, upper] = [id, target].toSorted();
    if (lower === undefined || upper === undefined) continue;
    const key = `${lower}${KEY_SEPARATOR}${upper}`;
    const sources = conflicts.get(key) ?? [];
    sources.push({ variableId: id, rule: 'differentFrom' });
    conflicts.set(key, sources);
  }

  const contradictions: ValidationContradiction[] = [];
  for (const [key, sources] of conflicts) {
    const [lower, upper] = key.split(KEY_SEPARATOR);
    const [first, ...rest] = sources;
    if (!lower || !upper || !first) continue;
    contradictions.push({
      class: 'pinnedEqualDifferentFrom',
      message: `Variables "${nameOf(lower, variables[lower])}", "${nameOf(upper, variables[upper])}" must differ but their rules pin both to the same value`,
      variableIds: [lower, upper],
      strips: [first, ...rest],
    });
  }

  return { contradictions, claimedPairs: new Set(conflicts.keys()) };
}

/**
 * How an equality group's members re-partition once ONE of the two grouping
 * mechanisms is removed: `'sameAs'` keeps only the members' `sameAs` edges,
 * `'comparators'` keeps only the strongly-connected components of their
 * internal non-strict comparator edges. Every edge of either mechanism that
 * touches a group member has its other end inside the same group (a `sameAs`
 * edge unions its two ends, and an SCC's whole cycle is unioned together — see
 * `buildEqualityGroups`), so both mechanisms can be replayed over the group in
 * isolation.
 */
const residualGroups = (
  variables: UnknownRecord,
  members: string[],
  internalNonStrictEdges: ComparatorEdge[],
  keep: 'sameAs' | 'comparators',
): string[][] => {
  const { find, union } = createUnionFind(members);
  const memberSet = new Set(members);
  if (keep === 'sameAs') {
    for (const member of members) {
      const target = usableReference(variables, member, 'sameAs');
      if (target !== undefined && memberSet.has(target)) union(target, member);
    }
  } else {
    for (const component of nonStrictComparatorComponents(
      internalNonStrictEdges,
    )) {
      const [anchor] = component;
      if (anchor === undefined) continue;
      for (const other of component.slice(1)) union(anchor, other);
    }
  }
  const partitions = new Map<string, string[]>();
  for (const member of members) {
    const root = find(member);
    const bucket = partitions.get(root) ?? [];
    bucket.push(member);
    partitions.set(root, bucket);
  }
  return [...partitions.values()];
};

/**
 * The rules a group-level emptiness conflict (interval, boolean domain or, for
 * Finding D, option-value-set) resolves by stripping. A group can be forced
 * together by `sameAs` edges, by non-strict comparator cycles, or by both, so
 * the policy asks which mechanism actually causes THIS conflict: it replays the
 * group with one mechanism removed (`residualGroups`) and keeps the removal
 * that leaves every residual sub-group satisfiable, per the caller's own
 * emptiness predicate.
 *
 * Ninth-wave Finding 3 is preserved as the `sameAs`-first branch: a "hybrid"
 * group — `sameAs`-joined members that also happen to have a one-way non-strict
 * comparator sitting between two of them (e.g. A sameAs B, plus A <= B) — is
 * resolved by dropping `sameAs` alone, because the comparator never forced the
 * grouping and stays satisfiable once the members separate. Twentieth-wave
 * Finding 2 corrects the other hybrid direction, which that policy got wrong:
 * when a comparator SCC is what empties the group (A pinned 0 and B pinned 1
 * joined by mutual `>=`), an unconstrained C carrying `C.sameAs = A` made the
 * repair delete C's satisfiable, unrelated rule — and the migration's fixpoint
 * then went on to strip the comparators anyway, so the rule was destroyed for
 * nothing. Neither branch resolving means both mechanisms genuinely contribute,
 * and both are stripped.
 */
const groupEqualityStrips = (
  variables: UnknownRecord,
  members: string[],
  internalNonStrictEdges: ComparatorEdge[],
  isEmptyFor: (subset: string[]) => boolean,
): VariableRuleRef[] => {
  const sameAsStrips = members
    .filter((member) => hasUsableSameAs(variables, member))
    .map((member): VariableRuleRef => ({ variableId: member, rule: 'sameAs' }));
  const comparatorStrips = internalNonStrictEdges.flatMap(
    (edge) => edge.sources,
  );
  const resolves = (keep: 'sameAs' | 'comparators'): boolean =>
    !residualGroups(variables, members, internalNonStrictEdges, keep).some(
      isEmptyFor,
    );
  if (sameAsStrips.length > 0 && resolves('comparators')) return sameAsStrips;
  if (comparatorStrips.length > 0 && resolves('sameAs'))
    return comparatorStrips;
  return [...sameAsStrips, ...comparatorStrips];
};

const intervalsOfMembers = (
  variables: UnknownRecord,
  members: string[],
): GroupIntervals => {
  const intervals: GroupIntervals = new Map();
  for (const member of members) {
    addToGroupIntervals(intervals, intervalOf(variables[member]));
  }
  return intervals;
};

/**
 * The option values EVERY member of a member list offers, with the single type
 * they share. `undefined` means the list is unusable for the option-set checks:
 * mixed types, a type without option semantics, or a member carrying no
 * `options` array at all (`optionValues` treats absent options as unusable
 * rather than empty).
 */
const sharedOptionValues = (
  variables: UnknownRecord,
  members: string[],
):
  | { type: 'categorical' | 'ordinal'; values: Set<string | number> }
  | undefined => {
  const types = new Set(members.map((member) => typeOf(variables[member])));
  const [onlyType] = types;
  if (types.size !== 1) return undefined;
  if (onlyType !== 'categorical' && onlyType !== 'ordinal') return undefined;
  let intersection: Set<string | number> | undefined;
  for (const member of members) {
    const values = optionValues(variables[member]);
    if (values === undefined) return undefined;
    intersection =
      intersection === undefined
        ? values
        : new Set([...intersection].filter((value) => values.has(value)));
  }
  if (intersection === undefined) return undefined;
  return { type: onlyType, values: intersection };
};

/**
 * The available boolean values every member of an all-boolean member list
 * offers; `undefined` when the list is not uniformly boolean.
 */
const sharedBooleanDomain = (
  variables: UnknownRecord,
  members: string[],
): Set<boolean> | undefined => {
  const types = new Set(members.map((member) => typeOf(variables[member])));
  const [onlyType] = types;
  if (types.size !== 1 || onlyType !== 'boolean') return undefined;
  let intersection: Set<boolean> | undefined;
  for (const member of members) {
    const domain = booleanDomain(variables[member]);
    intersection =
      intersection === undefined
        ? domain
        : new Set([...intersection].filter((value) => domain.has(value)));
  }
  return intersection;
};

/**
 * Twenty-first-wave Finding 2: the maximum number of periods a coarse
 * (month/year) DatePicker's declared window may enumerate before
 * `discreteInstantsEmpty` gives up on exact reasoning and falls back to the
 * convex-interval check above for the whole group. `datePickerParametersSchema`
 * floors a coarse year at 1000 but sets no ceiling, and a month picker
 * multiplies every year in its span by 12, so enumerating an unbounded window
 * is a real denial-of-service surface on protocol import — exactly the class
 * of defect the twenty-first-wave star-regression fix (the BFS queue in
 * `oddDifferentFromCycleContradictions`) closed for the odd-cycle graph. 1,000
 * periods comfortably covers any legitimate window an interview would ever
 * declare (a full millennium at year resolution, or 83-plus years at month
 * resolution) while bounding the worst case to a small, constant amount of
 * work per equality group.
 */
const COARSE_INSTANT_ENUMERATION_CAP = 1000;

type YearMonth = { year: number; month: number };

/**
 * A coarse DatePicker bound string, read strictly according to the picker's
 * OWN declared resolution rather than the string's shape — a defensive
 * reading appropriate for raw (pre-schema) migration input, matching the rest
 * of this file. `undefined` means the bound cannot be read at that
 * resolution at all (no year, or a month picker missing its month part).
 */
const parseCoarseBound = (
  value: string,
  resolution: 'month' | 'year',
): YearMonth | undefined => {
  const match = DATE_PART_PATTERN.exec(value);
  if (!match?.[1]) return undefined;
  const year = Number(match[1]);
  if (resolution === 'year') return { year, month: 1 };
  if (match[2] === undefined) return undefined;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return undefined;
  return { year, month };
};

// A single linear index over calendar periods at the given resolution, so two
// bounds can be counted and enumerated between without re-deriving day
// numbers at every step.
const coarsePeriodIndex = (
  { year, month }: YearMonth,
  resolution: 'month' | 'year',
): number => (resolution === 'year' ? year : year * 12 + (month - 1));

/**
 * The exact set of UTC day numbers a bounded coarse (month/year) DatePicker
 * can ever emit — one entry per period in its declared window, each at that
 * period's first day (the value `compareVariables` derives from the stored
 * truncated string; see `dayNumber`'s `'min'` edge). This is the set
 * `dateWindowInterval`'s convex `[min, max]` day-number range only
 * APPROXIMATES: a year picker spanning 2020-2021 emits just
 * {2020-01-01, 2021-01-01}, not every day between them.
 *
 * `undefined` means the variable is not a coarse DatePicker at all (full
 * resolution, whose OWN convex interval is already exact — see
 * `dateWindowInterval`'s docstring). `'unenumerable'` means it IS coarse but
 * its window cannot be safely enumerated — an open bound (no min or max to
 * enumerate between) or a window wider than
 * `COARSE_INSTANT_ENUMERATION_CAP` — and the caller must fall back to the
 * convex-interval reasoning for the whole group rather than reasoning from a
 * partial, arbitrarily-truncated set.
 */
const coarseInstantsOf = (
  variable: unknown,
): Set<number> | 'unenumerable' | undefined => {
  const resolution = dateResolutionOf(variable);
  if (resolution === 'full') return undefined;
  const parameters = asRecord(asRecord(variable)?.parameters);
  const min = parameters?.min;
  const max = parameters?.max;
  if (typeof min !== 'string' || typeof max !== 'string') {
    return 'unenumerable';
  }
  const minPeriod = parseCoarseBound(min, resolution);
  const maxPeriod = parseCoarseBound(max, resolution);
  if (!minPeriod || !maxPeriod) return 'unenumerable';
  const minIndex = coarsePeriodIndex(minPeriod, resolution);
  const maxIndex = coarsePeriodIndex(maxPeriod, resolution);
  const count = maxIndex - minIndex + 1;
  if (count <= 0 || count > COARSE_INSTANT_ENUMERATION_CAP) {
    return 'unenumerable';
  }
  const instants = new Set<number>();
  for (let index = minIndex; index <= maxIndex; index++) {
    const year = resolution === 'year' ? index : Math.floor(index / 12);
    const monthIndex = resolution === 'year' ? 0 : index % 12;
    instants.add(utcDayNumber(year, monthIndex, 1));
  }
  return instants;
};

const intersectInstantSets = (a: Set<number>, b: Set<number>): Set<number> => {
  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
  const result = new Set<number>();
  for (const value of smaller) {
    if (larger.has(value)) result.add(value);
  }
  return result;
};

/**
 * Twenty-first-wave Finding 2: whether a subset of a datetime equality group
 * can never actually share ONE value once each coarse member's discrete
 * emission set — not its convex day-number interval — is modelled exactly.
 * `intervalsEmpty` (in `disjointBoundsContradictions` below) already treats a
 * month/year picker's window as `[period start of min, period start of max]`
 * (twentieth-wave Finding 1 fixed the interval's MAX edge to use this same
 * period-start reading); that interval is still a SUPERSET of what the picker
 * can truly emit whenever the window spans more than one period. A year
 * picker spanning 2020-2021 and a month picker spanning 2020-02–2020-12 have
 * overlapping convex intervals (the month's nests entirely inside the
 * year's), so mutual non-strict comparators between them look satisfiable —
 * but the year picker can only ever emit {2020-01-01, 2021-01-01} and the
 * month picker only {2020-02-01, ..., 2020-12-01}, which share nothing.
 *
 * Only applies within the 'fixed' origin: coarse resolution only ever arises
 * on a DatePicker, whose window is always 'fixed' (`dateWindowInterval`), so
 * an 'interviewDate'-origin member (an anchorless RelativeDatePicker) simply
 * contributes no filter here, the same way `addToGroupIntervals` keeps the
 * two origins from ever being compared to each other. Scoped to
 * datetime-typed groups; a merged equality group is always uniformly typed
 * (every union edge requires `usableReference`'s same-type check), so testing
 * the first member would suffice, but every member is checked defensively as
 * the rest of the file does.
 *
 * Deliberately conservative: an inability to enumerate a coarse member's
 * window exactly (an open bound, or a window wider than
 * `COARSE_INSTANT_ENUMERATION_CAP`), or the absence of ANY coarse member at
 * all, makes this return `false` — never "empty" — so it can only ever ADD a
 * detection the interval check above missed, never invent a false rejection
 * of its own. The caller only ever consults this once the interval check has
 * already found the group non-empty, so a group this DOES flag is reported
 * exactly once.
 */
const discreteInstantsEmpty = (
  variables: UnknownRecord,
  subset: string[],
): boolean => {
  if (subset.length < 2) return false;
  const types = new Set(subset.map((member) => typeOf(variables[member])));
  const [onlyType] = types;
  if (types.size !== 1 || onlyType !== 'datetime') return false;

  let candidates: Set<number> | undefined;
  const fixedIntervals: Interval[] = [];
  for (const member of subset) {
    const variable = variables[member];
    const coarse = coarseInstantsOf(variable);
    if (coarse === 'unenumerable') return false;
    if (coarse === undefined) {
      const interval = dateWindowInterval(variable);
      if (interval?.origin === 'fixed') fixedIntervals.push(interval);
      continue;
    }
    candidates =
      candidates === undefined
        ? coarse
        : intersectInstantSets(candidates, coarse);
  }
  // No coarse member: the interval check above is already exact for a group
  // with no coarse resolution in play, so there is nothing further to detect.
  if (candidates === undefined) return false;

  for (const interval of fixedIntervals) {
    candidates = new Set(
      [...candidates].filter(
        (day) =>
          (interval.min === undefined || day >= interval.min) &&
          (interval.max === undefined || day <= interval.max),
      ),
    );
  }
  return candidates.size === 0;
};

const INTERVAL_ORIGINS = [
  'fixed',
  'interviewDate',
] as const satisfies readonly IntervalOrigin[];

/**
 * Variable types whose interval is measured in whole numbers: datetime bounds
 * are UTC day numbers (and, on the symbolic origin, integer day offsets — see
 * `relativeDateWindowInterval`), text bounds are string lengths, categorical
 * bounds are selection counts. `number` and `scalar` are DELIBERATELY absent:
 * their bounds are integers (`z.number().int()` in validation.ts) but the
 * VALUES are not — the interview runtime coerces a number field with a bare
 * `Number()` (`coerceFormValues`), so 1.5 is a legal answer. See
 * `stepChainBound`, which is the only reader.
 */
const INTEGER_QUANTITY_TYPES = new Set(['datetime', 'text', 'categorical']);

/**
 * One end of a propagated range, carried with enough provenance to name the
 * chain that produced it.
 */
type ChainBound = {
  value: number;
  /**
   * The bound is EXCLUSIVE: the node's value has to lie strictly beyond
   * `value`. Produced by a strict comparator step over a quantity that is not
   * known to be whole-numbered.
   */
  open: boolean;
  /** Index of the propagation node whose OWN declared bound seeded this. */
  root: number;
  /** The node this bound arrived from; absent at the root. */
  via: number | undefined;
  hops: number;
};

type ChainNode = {
  variableIds: string[];
  intervals: GroupIntervals;
  integral: boolean;
  /**
   * The node's own bounds are usable as a seed. A node whose merged interval
   * is already empty is reported by the group check above (or, for a group of
   * one, as `invertedBounds`), and the per-edge check below declines to judge
   * anything against it; propagation follows that precedent and treats it as
   * an unbounded relay rather than a chain endpoint.
   */
  seedable: boolean;
  outgoing: number[];
  incoming: number[];
};

type ChainEdge = {
  lower: number;
  upper: number;
  strict: boolean;
  sources: VariableRuleRef[];
};

/**
 * A candidate bound replaces the incumbent only when it is strictly tighter,
 * so the first witness of a given tightness is the one kept. Only tightness is
 * compared: checking the tightest bound at a node is complete, because any
 * looser one is satisfiable wherever the tightest is.
 */
const isTighterMin = (
  candidate: ChainBound,
  current: ChainBound | undefined,
): boolean => {
  if (!current) return true;
  if (candidate.value !== current.value) return candidate.value > current.value;
  return candidate.open && !current.open;
};

const isTighterMax = (
  candidate: ChainBound,
  current: ChainBound | undefined,
): boolean => {
  if (!current) return true;
  if (candidate.value !== current.value) return candidate.value < current.value;
  return candidate.open && !current.open;
};

/**
 * Carries a bound one comparator hop, in `direction` (+1 while pushing a lower
 * bound up the chain, -1 while pushing an upper bound down it).
 *
 * A non-strict hop passes the bound through unchanged. A strict hop needs the
 * next value to lie strictly beyond it, which is an exact `±1` on a
 * whole-numbered quantity and an open bound otherwise — the distinction that
 * makes `A >= B >= C` with `A.max = C.min` stay satisfiable while
 * `A > B > C` with the same bounds does not.
 */
const stepChainBound = (
  bound: ChainBound,
  strict: boolean,
  integral: boolean,
  direction: 1 | -1,
  from: number,
): ChainBound => {
  const carried = { root: bound.root, via: from, hops: bound.hops + 1 };
  if (!strict) return { ...carried, value: bound.value, open: bound.open };
  if (integral && Number.isInteger(bound.value)) {
    return { ...carried, value: bound.value + direction, open: false };
  }
  return { ...carried, value: bound.value, open: true };
};

const isIntegerQuantity = (variable: unknown): boolean => {
  const type = typeOf(variable);
  return type !== undefined && INTEGER_QUANTITY_TYPES.has(type);
};

/** A node's own declared bound, as the start of a propagation path. */
const seedChainBound = (
  node: number,
  value: number | undefined,
): ChainBound | undefined =>
  value === undefined
    ? undefined
    : { value, open: false, root: node, via: undefined, hops: 0 };

/**
 * The witness path a bound travelled, from the node it was observed at back to
 * the node that seeded it. `via` is written once per relaxation and the node it
 * names is settled by the time it is followed (each pass propagates out of a
 * node only after that node's own bound is final), so the walk terminates in
 * `hops` steps.
 */
const chainWitnessPath = (
  bounds: (ChainBound | undefined)[],
  start: number,
): number[] => {
  const path = [start];
  let cursor = bounds[start]?.via;
  let remaining = bounds[start]?.hops ?? 0;
  while (cursor !== undefined && remaining > 0) {
    path.push(cursor);
    cursor = bounds[cursor]?.via;
    remaining -= 1;
  }
  return path;
};

/**
 * Twenty-first-wave Finding 3: bounds closed over the whole comparator graph,
 * not just over each single hop.
 *
 * The per-edge check below judges one comparator against the two equality
 * groups it joins, so `A > B > C` with `A.maxValue: 1`, `C.minValue: 1` and an
 * unbounded `B` was accepted — each hop looks feasible in isolation because B
 * contributes no bound of its own — although no values satisfy the whole
 * chain. Transitivity is what closes that hole: C's floor is also B's floor
 * and therefore A's, and A's ceiling is likewise B's and C's.
 *
 * The pass is linear, with no relaxation loop:
 *
 *   - The GROUP dependency graph is condensed by strongly-connected
 *     component. An SCC carrying a strict edge is exactly a strict comparator
 *     cycle, already reported as `strictComparatorCycle`; its groups are
 *     dropped so this never double-reports them. An all-non-strict SCC merely
 *     forces its groups equal — one shared value satisfies it — so it merges
 *     into ONE node whose bounds are its members' intersected per origin. The
 *     group graph really can cycle without any variable-level cycle existing
 *     (`sameAs(A, B)` plus `A <= C <= B` puts {A,B} and {C} on a two-cycle),
 *     so the walk is cycle-safe rather than DAG-assuming.
 *   - The condensation is acyclic by construction, so ONE forward topological
 *     pass (lower bounds up the chain) and ONE reverse pass (upper bounds down
 *     it) reach the closure.
 *
 * Origins are propagated SEPARATELY, each pass seeded only from that origin's
 * own local bounds (fourteenth-wave Finding 1 keeps calendar day numbers and
 * symbolic interview-date offsets incomparable). A node carrying no bound on
 * the origin being propagated is simply a transparent relay for that pass,
 * which manufactures no cross-origin comparison: `A > B > C` yields `A > C`
 * by transitivity alone, whatever B is measured against.
 *
 * DELIBERATE LIMIT: numeric and day-number bounds only. Categorical option
 * sets and boolean domains are not propagated along chains — comparators do
 * not apply to those types (see `requireType` on the four comparator rules),
 * and the file's existing `differentFrom` checks declare chained domain
 * propagation out of scope.
 */
function chainedBoundContradictions(
  variables: UnknownRecord,
  graph: GroupGraph,
): ValidationContradiction[] {
  // Group-level adjacency in the propagation direction, lower → upper.
  const groupAdjacency = new Map<string, string[]>();
  for (const [upper, bucket] of graph.dependencies) {
    if (!groupAdjacency.has(upper)) groupAdjacency.set(upper, []);
    for (const lower of bucket.keys()) {
      const list = groupAdjacency.get(lower) ?? [];
      list.push(upper);
      groupAdjacency.set(lower, list);
    }
  }
  if (groupAdjacency.size === 0) return [];

  const components = stronglyConnectedComponents(groupAdjacency);
  const componentOf = new Map<string, number>();
  for (const [index, component] of components.entries()) {
    for (const group of component) componentOf.set(group, index);
  }

  const strictComponents = new Set<number>();
  for (const [upper, bucket] of graph.dependencies) {
    const upperComponent = componentOf.get(upper);
    if (upperComponent === undefined) continue;
    for (const [lower, edge] of bucket) {
      if (edge.strict && componentOf.get(lower) === upperComponent) {
        strictComponents.add(upperComponent);
      }
    }
  }

  const nodes: ChainNode[] = [];
  const nodeOf = new Map<string, number>();
  for (const [index, component] of components.entries()) {
    if (strictComponents.has(index)) continue;
    const variableIds = component.flatMap(
      (group) => graph.membersOf.get(group) ?? [],
    );
    const intervals = intervalsOfMembers(variables, variableIds);
    const nodeIndex = nodes.length;
    for (const group of component) nodeOf.set(group, nodeIndex);
    nodes.push({
      variableIds,
      intervals,
      integral:
        variableIds.length > 0 &&
        variableIds.every((id) => isIntegerQuantity(variables[id])),
      seedable: !hasEmptyOrigin(intervals),
      outgoing: [],
      incoming: [],
    });
  }

  const edges: ChainEdge[] = [];
  const edgeOf = new Map<string, number>();
  for (const [upper, bucket] of graph.dependencies) {
    const upperNode = nodeOf.get(upper);
    if (upperNode === undefined) continue;
    for (const [lower, edge] of bucket) {
      const lowerNode = nodeOf.get(lower);
      if (lowerNode === undefined || lowerNode === upperNode) continue;
      // Node indices are numbers, so a plain separator cannot collide the way
      // it could over unrestricted user data.
      const key = `${lowerNode}:${upperNode}`;
      const existingIndex = edgeOf.get(key);
      const existing =
        existingIndex === undefined ? undefined : edges[existingIndex];
      if (existing) {
        existing.strict = existing.strict || edge.strict;
        existing.sources.push(...edge.sources);
        continue;
      }
      edgeOf.set(key, edges.length);
      nodes[lowerNode]?.outgoing.push(edges.length);
      nodes[upperNode]?.incoming.push(edges.length);
      edges.push({
        lower: lowerNode,
        upper: upperNode,
        strict: edge.strict,
        sources: [...edge.sources],
      });
    }
  }

  // Kahn's algorithm over the condensation, which is acyclic by construction.
  const indegree = nodes.map((node) => node.incoming.length);
  const order: number[] = [];
  for (const [index, degree] of indegree.entries()) {
    if (degree === 0) order.push(index);
  }
  for (let cursor = 0; cursor < order.length; cursor++) {
    const index = order[cursor];
    if (index === undefined) continue;
    for (const edgeIndex of nodes[index]?.outgoing ?? []) {
      const edge = edges[edgeIndex];
      if (!edge) continue;
      const remaining = (indegree[edge.upper] ?? 0) - 1;
      indegree[edge.upper] = remaining;
      if (remaining === 0) order.push(edge.upper);
    }
  }

  const found: ValidationContradiction[] = [];
  const reported = new Set<string>();

  for (const origin of INTERVAL_ORIGINS) {
    const minBounds = nodes.map((node, index) =>
      seedChainBound(
        index,
        node.seedable ? node.intervals.get(origin)?.min : undefined,
      ),
    );
    for (const index of order) {
      const bound = minBounds[index];
      if (!bound) continue;
      for (const edgeIndex of nodes[index]?.outgoing ?? []) {
        const edge = edges[edgeIndex];
        const target = edge && nodes[edge.upper];
        if (!edge || !target) continue;
        const candidate = stepChainBound(
          bound,
          edge.strict,
          target.integral,
          1,
          index,
        );
        if (isTighterMin(candidate, minBounds[edge.upper])) {
          minBounds[edge.upper] = candidate;
        }
      }
    }

    const maxBounds = nodes.map((node, index) =>
      seedChainBound(
        index,
        node.seedable ? node.intervals.get(origin)?.max : undefined,
      ),
    );
    for (const index of order.toReversed()) {
      const bound = maxBounds[index];
      if (!bound) continue;
      for (const edgeIndex of nodes[index]?.incoming ?? []) {
        const edge = edges[edgeIndex];
        const target = edge && nodes[edge.lower];
        if (!edge || !target) continue;
        const candidate = stepChainBound(
          bound,
          edge.strict,
          target.integral,
          -1,
          index,
        );
        if (isTighterMax(candidate, maxBounds[edge.lower])) {
          maxBounds[edge.lower] = candidate;
        }
      }
    }

    for (const index of order) {
      const min = minBounds[index];
      const max = maxBounds[index];
      if (!min || !max) continue;
      // A single hop is exactly what the per-edge check already reports, and
      // reports identically; only genuinely transitive conclusions belong
      // here. This also excludes the two bounds tracing to ONE node — the
      // condensation is acyclic, so that can only be a node's own interval,
      // which is a local or group-level report rather than a chain.
      if (min.hops + max.hops < 2) continue;
      const feasible =
        min.value < max.value ||
        (min.value === max.value && !min.open && !max.open);
      if (feasible) continue;

      // Propagation derives an interval at EVERY node along an infeasible
      // chain, so canonicalise by the pair of bound-owning nodes the chain
      // runs between and report it once.
      const key = `${min.root}:${max.root}`;
      if (reported.has(key)) continue;
      reported.add(key);

      const chain = [
        ...chainWitnessPath(minBounds, index).toReversed(),
        ...chainWitnessPath(maxBounds, index).slice(1),
      ];
      // Strip policy follows the `strictComparatorCycle` precedent: a chain
      // has many symmetric single-rule repairs (either endpoint's bound, or
      // any one comparator on it), so rather than pick arbitrarily among them
      // it removes every comparator rule instance along the witness. That
      // over-strips relative to true minimality, by design.
      const strips: VariableRuleRef[] = [];
      const claimed = new Set<string>();
      for (let step = 0; step + 1 < chain.length; step++) {
        const edgeIndex = edgeOf.get(`${chain[step]}:${chain[step + 1]}`);
        const edge = edgeIndex === undefined ? undefined : edges[edgeIndex];
        for (const source of edge?.sources ?? []) {
          if (claimed.has(stripKey(source))) continue;
          claimed.add(stripKey(source));
          strips.push(source);
        }
      }
      const [first, ...rest] = strips;
      if (!first) continue;

      const memberIds = chain.flatMap((node) => nodes[node]?.variableIds ?? []);
      const names = memberIds.map(
        (memberId) => `"${nameOf(memberId, variables[memberId])}"`,
      );
      found.push({
        class: 'disjointBounds',
        message: `Variables ${names.join(', ')} form a comparison chain their value ranges can never satisfy`,
        variableIds: memberIds,
        strips: [first, ...rest],
      });
    }
  }

  return found;
}

function disjointBoundsContradictions(
  variables: UnknownRecord,
): ValidationContradiction[] {
  const found: ValidationContradiction[] = [];
  const graph = buildGroupGraph(variables);
  const { edges, groupOf, membersOf } = graph;

  // Non-strict comparator edges whose both ends fall inside one equality
  // group, bucketed by that group — the rules a comparator-forced group's
  // emptiness conflict strips (see `groupEqualityStrips`).
  const internalNonStrictEdgesByGroup = new Map<string, ComparatorEdge[]>();
  for (const edge of graph.internalEdges) {
    if (edge.strict) continue;
    const group = groupOf.get(edge.lower);
    if (group === undefined) continue;
    const bucket = internalNonStrictEdgesByGroup.get(group) ?? [];
    bucket.push(edge);
    internalNonStrictEdgesByGroup.set(group, bucket);
  }

  // Whether a candidate member list is left unsatisfiable by each of the four
  // group-level checks below. `groupEqualityStrips` re-runs the relevant one
  // over the sub-groups a partial repair would leave behind, so detection and
  // repair-sufficiency always ask exactly the same question. A list of one is
  // never "empty" here: a lone variable's own bounds are a local contradiction
  // (`invertedBounds`), which no amount of edge-stripping resolves.
  const intervalsEmpty = (subset: string[]): boolean =>
    subset.length > 1 && hasEmptyOrigin(intervalsOfMembers(variables, subset));

  const optionsDisjoint = (subset: string[]): boolean =>
    subset.length > 1 &&
    sharedOptionValues(variables, subset)?.values.size === 0;

  const optionShortfall = (
    subset: string[],
  ): { shared: number; minSelected: number } | undefined => {
    if (subset.length < 2) return undefined;
    const shared = sharedOptionValues(variables, subset);
    if (shared?.type !== 'categorical' || shared.values.size === 0) {
      return undefined;
    }
    const subsetIntervals = intervalsOfMembers(variables, subset);
    if (hasEmptyOrigin(subsetIntervals)) return undefined;
    const minSelected = subsetIntervals.get('fixed')?.min;
    if (minSelected === undefined || minSelected <= shared.values.size) {
      return undefined;
    }
    return { shared: shared.values.size, minSelected };
  };

  const optionsBelowMinSelected = (subset: string[]): boolean =>
    optionShortfall(subset) !== undefined;

  const booleanDomainsDisjoint = (subset: string[]): boolean =>
    subset.length > 1 && sharedBooleanDomain(variables, subset)?.size === 0;

  const groupIntervals = new Map<string, GroupIntervals>();
  for (const [group, members] of membersOf) {
    const intervals = intervalsOfMembers(variables, members);
    groupIntervals.set(group, intervals);

    const internalNonStrictEdges =
      internalNonStrictEdgesByGroup.get(group) ?? [];

    const report = (
      clause: string,
      isEmptyFor: (subset: string[]) => boolean,
    ): void => {
      const strips = groupEqualityStrips(
        variables,
        members,
        internalNonStrictEdges,
        isEmptyFor,
      );
      const [first, ...rest] = strips;
      if (!first) return;
      const names = members.map(
        (member) => `"${nameOf(member, variables[member])}"`,
      );
      found.push({
        class: 'disjointBounds',
        message: `Variables ${names.join(', ')} ${groupEqualityDescription(variables, members)} ${clause}`,
        variableIds: members,
        strips: [first, ...rest],
      });
    };

    if (intervalsEmpty(members)) {
      report('but their rules leave no value they can share', intervalsEmpty);
    } else {
      // Twenty-first-wave Finding 2: the interval intersection above can be
      // non-empty while the coarse (month/year) members' actual discrete
      // emission sets share nothing — see `discreteInstantsEmpty`. Skipped
      // whenever the interval check already fired: a discrete set is always a
      // subset of its member's own interval, so an already-empty interval
      // intersection would trivially re-report the same conflict.
      const discreteEmptyFor = (subset: string[]): boolean =>
        discreteInstantsEmpty(variables, subset);
      if (discreteEmptyFor(members)) {
        report(
          'but the exact dates their pickers can ever emit share no instant',
          discreteEmptyFor,
        );
      }
    }

    // Finding D: a sameAs-joined categorical/ordinal group whose members'
    // option value sets share nothing is equally unsatisfiable — no value
    // any member offers is a value every member offers. Comparators never
    // apply to these types (see `requireType` on the four comparator
    // rules), so such a group can only ever be sameAs-forced; the shared
    // strip/message helpers still handle the general case defensively.
    const shortfall = optionShortfall(members);
    if (optionsDisjoint(members)) {
      report('but share no option values', optionsDisjoint);
    } else if (shortfall) {
      // Non-empty but too small: the group's intersected minSelected (the
      // fixed-origin interval's `min` — the group interval pass intersects
      // every member's own minSelected, and selection counts are always
      // absolute) can still exceed the number of option values every member
      // actually shares, which is equally unsatisfiable. Ordinal is excluded
      // — it is single-select, so any non-empty shared set already suffices
      // and is covered by the emptiness check above. Skipped when the group's
      // own bounds are already empty — that case is reported above and
      // resolves via the same strips.
      report(
        `but share only ${shortfall.shared} option values, fewer than minSelected (${shortfall.minSelected})`,
        optionsBelowMinSelected,
      );
    }

    // Eighth-wave Finding 1: an equality group of boolean variables whose
    // members' available (option-restricted) domains share no value is
    // equally unsatisfiable — a variable offering only `true` joined to one
    // offering only `false` can never actually hold equal values. UNLIKE the
    // datetime resolution check below, this is deliberately NOT scoped to
    // groups with an actual `sameAs` edge: for booleans there is no
    // stored-string-vs-Date wrinkle the way there is for datetimes — a
    // `sameAs` edge and a non-strict comparator SCC both mean "these hold the
    // same boolean value", and fresco-ui's compareVariables compares booleans
    // by ordinary `===`, so a comparator-only-forced boolean equality group is
    // exactly as unsatisfiable as a sameAs-joined one. That is the wave-7
    // provenance this reuses: equal-comparison semantics for booleans are the
    // same as stored equality, so this check applies to BOTH sameAs and
    // comparator-only boolean groups.
    if (booleanDomainsDisjoint(members)) {
      report(
        'but their available values never overlap',
        booleanDomainsDisjoint,
      );
    }

    // The datetime resolution-uniformity check deliberately does NOT run on
    // these merged equality groups — see
    // `mixedResolutionSameAsContradictions` (tenth-wave Finding 5) for the
    // sameAs-component pass that replaced it.
  }

  for (const edge of edges) {
    const upperGroup = groupOf.get(edge.upper);
    const lowerGroup = groupOf.get(edge.lower);
    if (
      upperGroup === undefined ||
      lowerGroup === undefined ||
      upperGroup === lowerGroup
    ) {
      continue;
    }
    const upperIntervals: GroupIntervals =
      groupIntervals.get(upperGroup) ?? new Map();
    const lowerIntervals: GroupIntervals =
      groupIntervals.get(lowerGroup) ?? new Map();
    // An already-empty group is reported above; its sameAs strips resolve it
    // first, so edges touching it are not judged against nonsense bounds.
    if (hasEmptyOrigin(upperIntervals) || hasEmptyOrigin(lowerIntervals)) {
      continue;
    }
    // Fourteenth-wave Finding 1: only same-origin bounds are comparable.
    // Fifteenth-wave Finding 1: each shared origin is judged on its own, so a
    // group that also constrains an origin the other side says nothing about
    // still has its comparable origins checked; an edge whose two sides share
    // no origin at all is left unjudged.
    const infeasible = [...upperIntervals].some(([origin, upperInterval]) => {
      const lowerInterval = lowerIntervals.get(origin);
      if (upperInterval.max === undefined || lowerInterval?.min === undefined) {
        return false;
      }
      return edge.strict
        ? upperInterval.max <= lowerInterval.min
        : upperInterval.max < lowerInterval.min;
    });
    if (!infeasible) continue;
    const [first, ...rest] = edge.sources;
    if (!first) continue;
    const ownerName = nameOf(first.variableId, variables[first.variableId]);
    const otherId = first.variableId === edge.upper ? edge.lower : edge.upper;
    found.push({
      class: 'disjointBounds',
      message: `Variable "${ownerName}": ${first.rule} "${nameOf(otherId, variables[otherId])}" can never be satisfied because their value ranges do not overlap`,
      variableIds: [edge.upper, edge.lower],
      strips: [first, ...rest],
    });
  }

  found.push(...chainedBoundContradictions(variables, graph));

  return found;
}

/**
 * Third-wave Finding 3, rescoped by tenth-wave Finding 5: datetime variables
 * required to hold the SAME STORED STRING can never do so when they store
 * dates at different resolutions ('2020' at year resolution can never equal
 * '2020-05-03' at full resolution). Only `sameAs` imposes stored-string
 * equality — fresco-ui's isMatchingValue compares the two stored values
 * exactly — so the uniformity requirement applies within sameAs-CONNECTED
 * COMPONENTS (union-find over usable `sameAs` edges alone), NOT within the
 * merged equality groups of `buildEqualityGroups`. A comparator-forced
 * equality (a non-strict SCC) is enforced by compareVariables, which converts
 * both sides to `Date` before comparing, so a coarser and a finer resolution
 * CAN compare equal there. Seventh-wave Finding 1 had scoped the check to
 * merged groups containing at least one `sameAs` edge, but that still
 * over-flagged hybrids: A sameAs B (both full resolution) plus mutual
 * non-strict comparators joining B to year-resolution C merges {A, B, C}
 * into one group and rejected a satisfiable configuration
 * (A = B = '2020-01-01', C = '2020' satisfies the comparators under Date
 * conversion).
 *
 * The strips are exactly the cross-resolution `sameAs` edges (a declaring
 * variable whose resolution differs from its target's): by transitivity,
 * removing those leaves every remaining connected piece uniform, so this is
 * the minimal strip — and a mismatched component always contains at least
 * one such edge.
 */
function mixedResolutionSameAsContradictions(
  variables: UnknownRecord,
): ValidationContradiction[] {
  const { find, union } = createUnionFind(Object.keys(variables));
  const sameAsEdges: { source: string; target: string }[] = [];
  for (const id of Object.keys(variables)) {
    const target = usableReference(variables, id, 'sameAs');
    if (target === undefined || target === id) continue;
    sameAsEdges.push({ source: id, target });
    union(target, id);
  }

  const membersOf = new Map<string, string[]>();
  for (const id of Object.keys(variables)) {
    const root = find(id);
    const members = membersOf.get(root) ?? [];
    members.push(id);
    membersOf.set(root, members);
  }

  const found: ValidationContradiction[] = [];
  for (const members of membersOf.values()) {
    if (members.length < 2) continue;
    // `usableReference` only ever joins same-typed variables, so the Set is
    // defensive; one datetime member implies a datetime component.
    const types = new Set(members.map((member) => typeOf(variables[member])));
    const [onlyType] = types;
    if (types.size !== 1 || onlyType !== 'datetime') continue;
    const resolutions = new Set(
      members.map((member) => dateResolutionOf(variables[member])),
    );
    if (resolutions.size < 2) continue;
    const memberSet = new Set(members);
    const strips = sameAsEdges
      .filter(
        (edge) =>
          memberSet.has(edge.source) &&
          dateResolutionOf(variables[edge.source]) !==
            dateResolutionOf(variables[edge.target]),
      )
      .map(
        (edge): VariableRuleRef => ({
          variableId: edge.source,
          rule: 'sameAs',
        }),
      );
    const [first, ...rest] = strips;
    if (!first) continue;
    const names = members.map(
      (member) => `"${nameOf(member, variables[member])}"`,
    );
    found.push({
      class: 'disjointBounds',
      message: `Variables ${names.join(', ')} ${groupEqualityDescription(variables, members)} but store dates at different resolutions`,
      variableIds: members,
      strips: [first, ...rest],
    });
  }
  return found;
}

type BooleanDifferentFromEdge = {
  groupA: string;
  groupB: string;
  sources: VariableRuleRef[];
};

// The BFS-tree path from `from` up to the component's root, following
// `parent` pointers. Each node is assigned a parent exactly once (when first
// visited), so this is well-defined regardless of how much of the component
// the BFS has explored by the time it is called.
const pathToRoot = (parent: Map<string, string>, from: string): string[] => {
  const path = [from];
  let cursor = from;
  for (;;) {
    const next = parent.get(cursor);
    if (next === undefined) break;
    path.push(next);
    cursor = next;
  }
  return path;
};

/**
 * Odd cycles in the boolean-only `differentFrom` graph, at equality-group
 * granularity (a `sameAs` group of booleans holds one shared value, so
 * `differentFrom` edges connect groups, not individual variables).
 *
 * DELIBERATE LIMIT: only boolean variables are checked here. A boolean has
 * exactly two possible values, so an odd cycle — not 2-colourable — is
 * provably unsatisfiable regardless of which value is chosen: `A ≠ B`,
 * `B ≠ C`, `C ≠ A` forces three pairwise-distinct values out of a two-value
 * domain. Ordinal/categorical variables can hold more than two values, so the
 * equivalent question is general k-colourability, which has no efficient
 * exact check for arbitrary k — that's out of scope here and left to the
 * interview runtime's own fill-time enforcement as a backstop.
 *
 * `claimedPairs` (sorted `id\0id` keys) comes from
 * `pinnedEqualDifferentFromContradictions`, run once by the caller over ALL
 * types: a boolean pair already reported there — both ends pinned to the same
 * value (fifth-wave Finding 5, generalised by sixth-wave Finding 2) — is
 * excluded from the bipartite graph below so it isn't ALSO folded into an
 * odd-cycle report. DELIBERATE LIMIT: domain propagation through chains (a
 * pinned value forcing a neighbour's effective domain, cascading to a third
 * variable) is left to the interview runtime's own fill-time enforcement as a
 * backstop, same as the k-colourability limit above.
 */
function oddDifferentFromCycleContradictions(
  variables: UnknownRecord,
  claimedPairs: Set<string>,
): ValidationContradiction[] {
  const edges = comparatorEdges(variables);
  const { groupOf, membersOf } = buildEqualityGroups(variables, edges);

  const found: ValidationContradiction[] = [];

  const edgesByKey = new Map<string, BooleanDifferentFromEdge>();
  const adjacency = new Map<string, Set<string>>();

  for (const [id, variable] of Object.entries(variables)) {
    if (typeOf(variable) !== 'boolean') continue;
    // `usableReference` guarantees same-typed endpoints, so the target is
    // necessarily boolean too.
    const target = usableReference(variables, id, 'differentFrom');
    if (target === undefined) continue;
    const groupA = groupOf.get(id);
    const groupB = groupOf.get(target);
    // A self-reference, or a target inside the same equality group, is
    // already reported as a class-9 sameAsGroupConflict — not a graph edge.
    if (groupA === undefined || groupB === undefined || groupA === groupB) {
      continue;
    }
    const [lowerVar, upperVar] = [id, target].toSorted();
    if (
      lowerVar !== undefined &&
      upperVar !== undefined &&
      claimedPairs.has(`${lowerVar}${KEY_SEPARATOR}${upperVar}`)
    ) {
      // Already reported by pinnedEqualDifferentFromContradictions; keep it
      // out of the bipartite graph so it isn't ALSO folded into an
      // oddDifferentFromCycle report.
      continue;
    }
    const [lower, upper] = [groupA, groupB].toSorted();
    if (lower === undefined || upper === undefined) continue;
    const key = `${lower}${KEY_SEPARATOR}${upper}`;
    const existing = edgesByKey.get(key);
    if (existing) {
      existing.sources.push({ variableId: id, rule: 'differentFrom' });
    } else {
      edgesByKey.set(key, {
        groupA: lower,
        groupB: upper,
        sources: [{ variableId: id, rule: 'differentFrom' }],
      });
    }
    for (const [from, to] of [
      [groupA, groupB],
      [groupB, groupA],
    ] as const) {
      const neighbors = adjacency.get(from) ?? new Set<string>();
      neighbors.add(to);
      adjacency.set(from, neighbors);
    }
  }

  const color = new Map<string, 0 | 1>();
  const visited = new Set<string>();

  for (const start of adjacency.keys()) {
    if (visited.has(start)) continue;
    const parent = new Map<string, string>();
    // Twenty-first-wave Finding 2: a plain array with an advancing head
    // index, not `queue.shift()`. `shift()` is O(n) (every remaining element
    // is copied down one slot), so a star-shaped component — one hub joined
    // by `differentFrom` to thousands of leaves — made this BFS quadratic in
    // the leaf count even though the graph has no contradiction at all. The
    // array is never spliced, so `queue[head]` stays valid for every
    // enqueued node.
    const queue: string[] = [start];
    let head = 0;
    visited.add(start);
    color.set(start, 0);
    let bipartite = true;
    // Only the FIRST conflict is used to reconstruct a strip-worthy cycle —
    // a component can contain more than one odd cycle (e.g. two triangles
    // sharing a vertex), but Finding 1 only strips the one, so a valid rule
    // elsewhere in the component (a differentFrom edge that merely branches
    // off the cycle, never closing a loop of its own) is left untouched. The
    // BFS still runs to completion rather than stopping at the first
    // conflict, so `visited` correctly covers the whole component and later
    // `start`s never re-enter it with a fresh, incommensurate colouring.
    let conflict: { node: string; neighbor: string } | undefined;

    while (head < queue.length) {
      const node = queue[head];
      head++;
      if (node === undefined) break;
      const nodeColor = color.get(node);
      if (nodeColor === undefined) continue;
      for (const neighbor of adjacency.get(node) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          color.set(neighbor, nodeColor === 0 ? 1 : 0);
          parent.set(neighbor, node);
          queue.push(neighbor);
        } else if (color.get(neighbor) === nodeColor) {
          bipartite = false;
          conflict ??= { node, neighbor };
        }
      }
    }

    if (bipartite || !conflict) continue;

    // Reconstruct ONE odd cycle: the conflict edge plus the two BFS-tree
    // paths from its endpoints up to their lowest common ancestor. Both
    // paths necessarily terminate at the same root (one BFS per component),
    // so the first node from `node`'s path that also appears in
    // `neighbor`'s path is their LCA.
    const pathFromNode = pathToRoot(parent, conflict.node);
    const pathFromNeighbor = pathToRoot(parent, conflict.neighbor);
    const neighborAncestors = new Set(pathFromNeighbor);
    const lcaIndex = pathFromNode.findIndex((candidate) =>
      neighborAncestors.has(candidate),
    );
    const lca = pathFromNode[lcaIndex];
    if (lca === undefined) continue;
    const sideFromNode = pathFromNode.slice(0, lcaIndex + 1); // node..lca
    const lcaIndexInNeighborPath = pathFromNeighbor.indexOf(lca);
    const sideFromNeighbor = pathFromNeighbor
      .slice(0, lcaIndexInNeighborPath)
      .toReversed(); // (lca's child)..neighbor
    const cycleGroups = [...sideFromNode, ...sideFromNeighbor];

    const cycleEdges: BooleanDifferentFromEdge[] = [];
    for (let index = 0; index < cycleGroups.length; index++) {
      const a = cycleGroups[index];
      const b = cycleGroups[(index + 1) % cycleGroups.length];
      if (a === undefined || b === undefined) continue;
      const [lower, upper] = [a, b].toSorted();
      const edge = edgesByKey.get(`${lower}${KEY_SEPARATOR}${upper}`);
      if (edge) cycleEdges.push(edge);
    }
    const sources = cycleEdges.flatMap((edge) => edge.sources);
    const [first, ...rest] = sources;
    if (!first) continue;
    const memberIds = [...new Set(cycleGroups)].flatMap(
      (group) => membersOf.get(group) ?? [],
    );
    const names = memberIds.map(
      (memberId) => `"${nameOf(memberId, variables[memberId])}"`,
    );
    found.push({
      class: 'oddDifferentFromCycle',
      message: `Variables ${names.join(', ')}: their differentFrom rules cannot all be satisfied with only two possible values`,
      variableIds: memberIds,
      strips: [first, ...rest],
    });
  }

  return found;
}

export function findValidationContradictions(
  variables: UnknownRecord,
): ValidationContradiction[] {
  const { contradictions: pinnedEqualContradictions, claimedPairs } =
    pinnedEqualDifferentFromContradictions(variables);
  return [
    ...localContradictions(variables),
    ...referenceStructureContradictions(variables),
    ...disjointBoundsContradictions(variables),
    ...mixedResolutionSameAsContradictions(variables),
    ...pinnedEqualContradictions,
    ...oddDifferentFromCycleContradictions(variables, claimedPairs),
  ];
}
