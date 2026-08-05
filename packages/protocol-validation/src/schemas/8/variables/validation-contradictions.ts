import {
  DATE_PICKER_DEFAULT_MIN,
  DATE_PICKER_EARLIEST_DATE,
  DATE_PICKER_LATEST_DATE,
  RELATIVE_DATE_PICKER_DEFAULT_AFTER,
  RELATIVE_DATE_PICKER_DEFAULT_BEFORE,
} from '@codaco/shared-consts';

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
  | 'pinnedEqualDifferentFrom'
  | 'pinnedDifferentFromParity';

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
    const type = typeOf(variable);
    const zeroMaximum =
      type === 'text'
        ? ({ min: 'minLength', max: 'maxLength' } as const)
        : type === 'categorical'
          ? ({ min: 'minSelected', max: 'maxSelected' } as const)
          : undefined;
    if (
      zeroMaximum !== undefined &&
      validationOf(variable).required === true &&
      numberRule(variable, zeroMaximum.max) === 0
    ) {
      const explicitMin = numberRule(variable, zeroMaximum.min);
      // A positive explicit minimum already reports through the ordinary
      // inverted-bound check above. Otherwise requiredness supplies the
      // implicit minimum of one non-empty character/selection.
      if (explicitMin === undefined || explicitMin <= 0) {
        found.push({
          class: 'invertedBounds',
          message: `Variable "${name}": required answers cannot satisfy ${zeroMaximum.max} (0)`,
          variableIds: [id],
          strips: [{ variableId: id, rule: zeroMaximum.max }],
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
 *
 * `labelOf` maps each endpoint to the graph node it contributes to before the
 * edge is added — the default is "one node per variable", but
 * `buildEqualityGroups` (Twenty-first-wave Finding 6) passes a union-find's
 * `find` so the SCC search runs on the CONTRACTED graph instead. An edge
 * whose two ends already share a label becomes a harmless self-loop (it
 * cannot inflate a component past size 1 on its own), so no special-casing is
 * needed for it here.
 */
function nonStrictComparatorComponents(
  edges: ComparatorEdge[],
  labelOf: (id: string) => string = (id) => id,
): string[][] {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.strict) continue;
    const lower = labelOf(edge.lower);
    const upper = labelOf(edge.upper);
    const list = adjacency.get(lower) ?? [];
    list.push(upper);
    adjacency.set(lower, list);
    if (!adjacency.has(upper)) adjacency.set(upper, []);
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
 *
 * Twenty-first-wave Finding 6: a non-strict comparator cycle can close ONLY
 * once its endpoints are already unioned. `A.sameAs = C` plus `A >= B` and
 * `B >= C` forces `A = B = C`: on the RAW variable graph those two comparator
 * edges are just an acyclic chain `C → B → A` (`nonStrictComparatorComponents`
 * finds nothing), but once `A` and `C` are contracted into one node by
 * `sameAs`, the same two edges close a 2-cycle between `B` and that node.
 * Computing the comparator SCCs once, on the raw graph, before folding in
 * `sameAs`, missed exactly this. The fix re-derives the non-strict comparator
 * SCCs on the CURRENT union-find partition — `nonStrictComparatorComponents`
 * takes `find` as its node-labelling function — and repeats: merging a
 * comparator SCC can turn two edges that used to land on two different groups
 * into edges on the same pair of (now coarser) groups, closing a cycle that
 * did not exist before that merge.
 *
 * This loop is guaranteed to terminate, and in fact converges in at most one
 * substantive round: contracting a directed graph's strongly-connected
 * components always yields an ACYCLIC condensation (a standard graph-theory
 * fact — if components stayed cyclic with each other after contraction, their
 * members would already have been mutually reachable before it, so Tarjan
 * would have merged them into one SCC to begin with). So the round
 * immediately following the first one that finds anything is mathematically
 * guaranteed to find nothing, and the `components.length === 0` check stops
 * it there. The `round < ids.length` bound is a second, independent guard —
 * every round that does not stop must union at least two previously-distinct
 * groups, strictly shrinking the group count, which is bounded below by 1 and
 * starts at `ids.length`, so the loop cannot spin even if some future change
 * to this function broke that monotonicity.
 */
function buildEqualityGroups(
  variables: UnknownRecord,
  edges: ComparatorEdge[],
): {
  groupOf: Map<string, string>;
  membersOf: Map<string, string[]>;
} {
  const ids = Object.keys(variables);
  const { find, union } = createUnionFind(ids);

  for (const id of ids) {
    const target = usableReference(variables, id, 'sameAs');
    if (target !== undefined) union(target, id);
  }

  for (let round = 0; round < ids.length; round++) {
    const components = nonStrictComparatorComponents(edges, find);
    if (components.length === 0) break;
    for (const component of components) {
      const [anchor] = component;
      if (anchor === undefined) continue;
      for (const member of component.slice(1)) union(anchor, member);
    }
  }

  const groupOf = new Map<string, string>();
  const membersOf = new Map<string, string[]>();
  for (const id of ids) {
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

/**
 * Union-find over usable `sameAs` edges alone, ignoring the non-strict
 * comparator SCCs `buildEqualityGroups` also folds into its merged equality
 * groups. This is the same scoping `mixedResolutionSameAsContradictions`
 * (below) already relies on to separate two different guarantees: a
 * `sameAs` edge forces the two stored VALUES to be identical (fresco-ui's
 * `isMatchingValue`, which `sameAs`/`differentFrom` both use, compares
 * stored values exactly), while a non-strict comparator SCC only forces them
 * to compare equal at runtime — and `compareVariables` converts `datetime`
 * operands through `Date` before comparing, so two different stored strings
 * (a full-resolution day and a coarser month/year truncation of the same
 * instant) can satisfy it without ever matching as stored values. Extracted
 * so the class-9 `differentFrom` check below (Twenty-second-wave Finding 3)
 * can ask the same "is this forced by an actual sameAs edge" question
 * without deriving a second, independent scoping mechanism. The
 * twenty-fourth-wave pin-inheritance pass (`sameAsInheritedPins`) scopes to
 * these same components for the same reason.
 */
function sameAsOnlyUnionFind(variables: UnknownRecord) {
  const unionFind = createUnionFind(Object.keys(variables));
  for (const id of Object.keys(variables)) {
    const target = usableReference(variables, id, 'sameAs');
    if (target === undefined || target === id) continue;
    unionFind.union(target, id);
  }
  return unionFind;
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
  const { find: sameAsFind } = sameAsOnlyUnionFind(variables);

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
    // Twenty-second-wave Finding 3: the merged equality group above can join
    // `id` and `target` via a non-strict comparator SCC alone (no `sameAs`
    // edge connecting them at all), and only `sameAs` forces their STORED
    // values identical — see `sameAsOnlyUnionFind`. For `number`/`scalar` a
    // comparator-forced equality is still exact (`Number()`-equal already IS
    // value-equal; neither type stores more than one textual representation
    // of the same quantity), so only `datetime` can diverge, and only when
    // the pair's OWN resolutions differ: two datetime values at the SAME
    // resolution are each other's canonical encoding, so a forced Date-equal
    // already implies their stored strings match too. No explicit
    // self-reference guard is needed: `sameAsFind(id)` called on the same id
    // twice is always equal, so the group-of-one case never satisfies this
    // condition and always falls through to the rejection below.
    if (
      sameAsFind(id) !== sameAsFind(target) &&
      typeOf(variable) === 'datetime' &&
      dateResolutionOf(variable) !== dateResolutionOf(variables[target])
    ) {
      continue;
    }
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

/**
 * Twenty-third-wave Finding 6: the earliest date the native
 * `<input type="date">` control backing both datetime pickers can ever
 * select or emit — day 0001-01-01, the very floor `datePickerParametersSchema`
 * already carves out for a schema-valid, full-resolution DatePicker bound
 * (eleventh-wave Finding 1's own comment: "0000-12-31 is a real,
 * round-tripping ISO date … but the native HTML date input's earliest
 * selectable date is 0001-01-01"). That schema check only ever gates an
 * author-typed `min`/`max` string, so it says nothing about a bound this file
 * DERIVES arithmetically: a RelativeDatePicker's `anchor - before` can walk
 * past year zero into negative (BCE) years the same way `min`/`max` could,
 * and the interview runtime's own `addDays` (fresco-ui's `form/utils/ymd.ts`)
 * renders a negative year via plain `String(year).padStart(4, '0')` — which
 * does not zero-pad a sign, so the result (`-174-03-19`) fails the native
 * control's `YYYY-MM-DD` grammar outright. The browser has nothing to fall
 * back to but its own year-0001 floor, so the control's TRUE reachable
 * minimum is this constant, however much further the arithmetic overshot it.
 */
const NATIVE_DATE_INPUT_FLOOR_DAY_NUMBER = utcDayNumber(
  Number(DATE_PICKER_EARLIEST_DATE.slice(0, 4)),
  Number(DATE_PICKER_EARLIEST_DATE.slice(5, 7)) - 1,
  Number(DATE_PICKER_EARLIEST_DATE.slice(8, 10)),
);

/**
 * Clamps a 'fixed'-origin datetime interval's lower edge at the floor above,
 * modelling what the control actually does with an authored/derived bound
 * that reaches earlier than it can ever emit: it silently truncates to its
 * own floor, rather than the variable becoming unusable. Only ever narrows —
 * raises `min`, never lowers `max` — so every window this produces is a real,
 * still-reachable one; it can turn a genuinely satisfiable comparison into an
 * infeasible one (the runtime truly cannot reach far enough back), but never
 * the reverse. Left a no-op on the `'interviewDate'` origin: those bounds are
 * symbolic day OFFSETS from a not-yet-known interview date (fourteenth-wave
 * Finding 1), not calendar day numbers, so comparing one against this
 * calendar floor would be meaningless — and, by construction, an
 * anchorless picker's offsets are never negative enough to need it anyway
 * (`relativeDatePickerParametersSchema` requires `before`/`after` >= 0, so an
 * anchorless window's own min is `-before`, no lower than the negative of
 * whatever `before` an author typed, never a calendar-scale BCE number).
 *
 * No matching ceiling exists at the upper edge. The floor is a failure of
 * FORMAT, not of range: `formatYmd`'s `padStart(4, '0')` only breaks on a
 * negative year (the sign character defeats the fixed-width zero-padding);
 * a year running past 9999 merely grows an extra digit and stays a
 * syntactically valid `YYYY…-MM-DD` string the control can still parse.
 * Manufacturing a ceiling here would invent a restriction neither the
 * schema nor the runtime actually enforces.
 */
const clampToNativeDateFloor = (interval: Interval): Interval =>
  interval.origin === 'fixed' &&
  interval.min !== undefined &&
  interval.min < NATIVE_DATE_INPUT_FLOOR_DAY_NUMBER
    ? { ...interval, min: NATIVE_DATE_INPUT_FLOOR_DAY_NUMBER }
    : interval;

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
  // Twenty-third-wave Finding 6: a low `anchor` with a large enough `before`
  // derives a `min` earlier than the native date control can ever emit — see
  // `clampToNativeDateFloor`.
  return clampToNativeDateFloor({
    min: anchor - before,
    max: anchor + after,
    origin: 'fixed',
  });
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
 * The lower edge of the runtime's default DatePicker window — fresco-ui
 * DatePicker.tsx's `DEFAULT_MIN`, 1920-01-01. Only the YEAR is needed below:
 * the runtime constant's month and day are both 1, and a parsed authored
 * bound's missing month/day also default to 1, so the runtime's
 * `compareYmd(authoredMax, DEFAULT_MIN) < 0` test is exactly `year < 1920`.
 */
const DEFAULT_DATE_WINDOW_MIN_YEAR = Number(
  DATE_PICKER_DEFAULT_MIN.slice(0, 4),
);

/**
 * Twenty-fifth wave: the latest plausible interview date the synthesized
 * coarse-window model below promises to cover. The runtime's synthesized far
 * bound is "today"-dependent (its span is `today.year - 1920`, so it widens
 * as the wall clock advances), while this file deliberately contains no wall
 * clock at all — protocol validity must not depend on when validation runs.
 * The model therefore uses the span AT THIS HORIZON (200 years), the widest
 * span any interview run on or before 31 December 2120 can experience, which
 * makes every modelled window a superset of every window the runtime can
 * actually offer within the horizon. A superset can only ever ACCEPT more
 * (the safe direction for the migration's rule-stripping); the sole error
 * mode is a stripped rule that would have been satisfiable only in an
 * interview conducted after 2120 — almost a century past any plausible
 * lifetime of a schema-8 protocol.
 */
const COARSE_SYNTHESIS_HORIZON_YEAR = 2120;

/**
 * The runtime's `defaultWindowSpanYears` (`today.year - DEFAULT_MIN.year`)
 * evaluated at the horizon — the widest span the model must cover.
 */
const COARSE_SYNTHESIS_SPAN_YEARS =
  COARSE_SYNTHESIS_HORIZON_YEAR - DEFAULT_DATE_WINDOW_MIN_YEAR;

/**
 * Twenty-sixth-wave Finding 3: the years a coarse (month/year) control can
 * validly EMIT — the four-digit-year grammar the truncated stored string
 * shares with `datePickerParametersSchema`'s own coarse-bound floor
 * (variable.ts rejects a coarse bound before year 1000). fresco-ui's
 * DatePicker clamps its SYNTHESIZED far bound to this range (the authored
 * side is honoured verbatim), so the model's synthesized side clamps
 * identically — see `synthesizedCoarseMissingSideBound`. The analyser's previously
 * unclamped synthesis was a safe superset of the clamped runtime window (a
 * superset can only accept more), so this is a precision improvement, not a
 * soundness fix.
 *
 * Thirty-fourth wave (Fix 1): the MAX side of this range is also the top of
 * the fixed-width four-digit `YYYY-MM-DD` grammar every authored bound, every
 * schema-valid stored value, and this file's own day-number arithmetic share,
 * which is why it doubles as the FULL-resolution submission ceiling — see
 * `fullResolutionSubmissionFarBound`. The 1000 floor stays coarse-only: the
 * native input floors at year 1 instead (`clampToNativeDateFloor`).
 */
const COARSE_SYNTHESIS_MIN_YEAR = 1000;
const COARSE_SYNTHESIS_MAX_YEAR = Number(DATE_PICKER_LATEST_DATE.slice(0, 4));

/**
 * Mirrors fresco-ui DatePicker.tsx's `parseYmd` exactly — grammar
 * (`YYYY[-MM[-DD]]`) and range checks included — because "is this bound
 * authored?" must be decided the way the runtime decides it. A string
 * `parseYmd` rejects is an ABSENT bound to the runtime (its `??` fallbacks
 * apply), so it must count as absent here too; conversely a string it
 * accepts suppresses the runtime's synthesis, and treating such a bound as
 * absent would synthesize a hard edge the runtime never imposes. Deviations
 * from the runtime grammar therefore matter in BOTH directions, unlike the
 * deliberately-defensive `parseCoarseBound` (which, e.g., requires a month
 * picker's bound to carry its month part — a reading that is safely
 * conservative for enumeration but wrong for this authored-ness test).
 */
const RUNTIME_YMD_PATTERN = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;

const parseRuntimeYmd = (
  value: unknown,
): { year: number; month: number; day: number } | undefined => {
  if (typeof value !== 'string') return undefined;
  const match = RUNTIME_YMD_PATTERN.exec(value);
  if (!match?.[1]) return undefined;
  const year = Number(match[1]);
  const month = match[2] === undefined ? 1 : Number(match[2]);
  const day = match[3] === undefined ? 1 : Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  return { year, month, day };
};

/**
 * Twenty-fifth wave, widened by the thirtieth (Fix 4): the bound a coarse
 * (month/year) DatePicker's MISSING side actually resolves to at runtime.
 * The runtime's combined derivation (DatePicker.tsx's `minYmd`/`maxYmd`
 * useMemo, read through its coarse pair) is:
 *
 *   - an absent (or `parseYmd`-unparseable) `min` falls back to 1920-01-01,
 *     UNLESS the authored `max` is earlier than that default — then the lower
 *     bound extends BELOW it by the default window's own span
 *     (`today.year - 1920`): `{ year: max.year - span, month: 1, day: 1 }`;
 *   - an absent `max` falls back to today, UNLESS the authored `min` is later
 *     than today — then `{ year: min.year + span, month: 12, day: 31 }`;
 *   - the extended side always covers full calendar years (January through
 *     December), never the authored bound's own sub-year month/day;
 *   - the synthesized (never the authored) side is clamped to the years a
 *     coarse control can validly emit — 1000 below, 9999 above
 *     (twenty-sixth-wave Finding 3; see `COARSE_SYNTHESIS_MIN_YEAR` /
 *     `COARSE_SYNTHESIS_MAX_YEAR`);
 *   - both-authored windows are honoured exactly, and a picker with neither
 *     bound gets the plain default window.
 *
 * For a coarse picker those resolved bounds are as hard as authored ones —
 * the year/month dropdowns offer nothing beyond them — so a one-sided
 * out-of-window coarse picker must NOT be modelled as half-open (a required
 * year picker with only `max: '1800'` offers roughly [1800 - span, 1800];
 * nothing below that is ever selectable), and — thirtieth-wave Fix 4 — the
 * DEFAULT edges are exactly as hard: an unbounded year picker offers nothing
 * below 1920 whatever the interview date, so a `lessThanVariable` partner
 * pinned at 1900 can never be exceeded from below. Wave 25 recorded
 * "neither-authored coarse derives no interval" as a safe superset; the
 * reviewer's demonstration shows the miss rejecting a real defect.
 *
 * "Today" is modelled conservatively (see `COARSE_SYNTHESIS_HORIZON_YEAR`):
 *
 *   - The MIN side is date-INdependent throughout: the runtime's dropdown
 *     floor is the constant 1920-01-01 whenever no authored min is in play
 *     and the authored max (if any) is at or after it, so the default edge
 *     is modelled EXACTLY — `{ year: 1920, month: 1 }`, January at month
 *     resolution. The `max.year < 1920` branch condition is equally
 *     date-independent and mirrored exactly; its extended lower edge uses
 *     the HORIZON span, at or below the runtime's `max.year - span(today)`
 *     for every in-horizon interview date (the span only grows toward the
 *     horizon).
 *   - The MAX side is date-dependent both ways, so it stays conservative:
 *     the default today-edge is NOT modelled (half-open is the superset of
 *     every current-year cap through the horizon), and the `min > today`
 *     extension is synthesized only when `min.year > horizon` — the
 *     condition holding on EVERY in-horizon interview date, with the
 *     horizon-span ceiling at or above the runtime's `min.year + span(today)`.
 *     A one-sided `min` between today and the horizon stays half-open: on a
 *     later in-horizon interview date the runtime's branch flips to the
 *     default today-edge, so no single synthesized ceiling is right for
 *     every plausible date, and half-open is the superset of both branches.
 *
 * The returned period is the STORED-INSTANT reading of the modelled edge
 * (twentieth-wave Finding 1). At most one edge is ever returned — the
 * missing side that can be modelled without a wall clock — and both-authored
 * windows return `undefined`. FULL-resolution pickers return `undefined`
 * too: their one-sided submission far bounds are modelled by
 * `fullResolutionSubmissionFarBound` below (thirty-fourth-wave Fix 1), not
 * here — a native input under a `noValidate` form enforces nothing, unlike
 * these closed dropdowns.
 */
const synthesizedCoarseMissingSideBound = (
  parameters: UnknownRecord,
  resolution: 'month' | 'year',
): { edge: 'min' | 'max'; period: YearMonth } | undefined => {
  const authoredMin = parseRuntimeYmd(parameters.min);
  const authoredMax = parseRuntimeYmd(parameters.max);
  if (!authoredMin) {
    // Twenty-sixth-wave Finding 3: the SYNTHESIZED side is clamped to the
    // years a coarse control can validly emit (the runtime applies the same
    // clamp to its own synthesized bound; the authored side stays untouched)
    // — see `COARSE_SYNTHESIS_MIN_YEAR`/`COARSE_SYNTHESIS_MAX_YEAR`.
    if (authoredMax && authoredMax.year < DEFAULT_DATE_WINDOW_MIN_YEAR) {
      return {
        edge: 'min',
        period: {
          year: Math.max(
            COARSE_SYNTHESIS_MIN_YEAR,
            authoredMax.year - COARSE_SYNTHESIS_SPAN_YEARS,
          ),
          month: 1,
        },
      };
    }
    // Thirtieth wave (Fix 4): no authored min, and any authored max sits at
    // or after the default floor — the dropdown's lower edge is the STABLE
    // default 1920, modelled exactly.
    return {
      edge: 'min',
      period: { year: DEFAULT_DATE_WINDOW_MIN_YEAR, month: 1 },
    };
  }
  if (!authoredMax && authoredMin.year > COARSE_SYNTHESIS_HORIZON_YEAR) {
    return {
      edge: 'max',
      period: {
        year: Math.min(
          COARSE_SYNTHESIS_MAX_YEAR,
          authoredMin.year + COARSE_SYNTHESIS_SPAN_YEARS,
        ),
        month: resolution === 'year' ? 1 : 12,
      },
    };
  }
  return undefined;
};

/** The first day of a coarse calendar period, as a UTC day number. */
const periodStartDayNumber = ({ year, month }: YearMonth): number =>
  utcDayNumber(year, month - 1, 1);

/**
 * The last day of the fixed-width four-digit `YYYY-MM-DD` grammar — the
 * ceiling of a one-sided full-resolution SUBMISSION window (see
 * `fullResolutionSubmissionFarBound`).
 */
const FOUR_DIGIT_GRAMMAR_CEILING_DAY_NUMBER = utcDayNumber(
  COARSE_SYNTHESIS_MAX_YEAR,
  11,
  31,
);

/**
 * Thirty-fourth wave (Fix 1), correcting the thirtieth wave's Fix 2 and the
 * thirty-second wave's Fix 3: the far bound of a one-sided FULL-resolution
 * DatePicker's SUBMISSION domain. The earlier waves modelled the RESOLVED
 * native `min`/`max` attributes (fresco-ui resolves and passes both
 * whenever either bound is authored — DatePicker.tsx's `hasAuthoredBound`
 * gate), but the reviewer demonstrates those attributes are not submission
 * bounds. The verified runtime chain:
 *
 *   - the resolved/synthesized side exists ONLY as a native
 *     `<input type="date">` `min`/`max` attribute (DatePicker.tsx's
 *     full-resolution return path), and fresco-ui's form element is
 *     `noValidate` (Form.tsx), so the browser never blocks submission on it;
 *   - the interview runtime forwards only the AUTHORED `params.min`/
 *     `params.max` strings into the Zod submission validators
 *     (useProtocolForm.tsx's DatePicker branch → fresco-ui's `min`/`max`
 *     validation functions), so a keyboard-typed date beyond the native
 *     attribute still validates against the authored side alone. (A
 *     RelativeDatePicker is DIFFERENT: useProtocolForm PRE-COMPUTES its
 *     absolute min/max and hands them to those same validators, so
 *     `relativeDateWindowInterval`'s window really is submission-enforced —
 *     unchanged here.)
 *
 * The reviewer's repro: `min: '1900-01-01'` alone, `greaterThanVariable` a
 * partner pinned at 2200-01-01 — rejected under the resolved-attribute
 * model (ceiling 2120-12-31), yet typing 2201-01-01 passes the authored-min
 * validator and the comparator at runtime. A modelled window NARROWER than
 * the submission domain rejects satisfiable protocols, which the v7 import
 * turns into silent rule-stripping — the worst failure this module has. The
 * submission-domain model, per side:
 *
 *   - authored min only ⇒ modelled max at 9999-12-31, the top of the
 *     four-digit grammar. The submission comparator (`compareDateStrings`)
 *     is LEXICAL over the fixed-width `YYYY-MM-DD` grammar (both operands
 *     truncated to the shorter length), and within that grammar every
 *     string is 10 characters, so lexical order IS chronological order:
 *     every four-digit-grammar day at or after the authored min passes the
 *     only submission check that exists, all the way up to the grammar's
 *     own last day. The wave-32 single-day pin survives under this
 *     derivation: an authored `min: '9999-12-31'` admits exactly one
 *     in-grammar day (nothing sorts above it), collapsing the window to a
 *     pin exactly as before. MODEL BOUNDARY, stated for honesty: a
 *     keyboard-typed FIVE-digit year is outside this grammar — the
 *     truncating comparator orders such strings incoherently against a
 *     four-digit bound (some sort below it, some above), fresco-ui's own
 *     NATIVE_MAX_YEAR comment records five-digit years as unusable, and the
 *     analyser deliberately reasons over the shared four-digit grammar
 *     only, exactly as wave 32 committed;
 *   - authored max only ⇒ modelled min at the native FORMAT floor,
 *     0001-01-01 (`NATIVE_DATE_INPUT_FLOOR_DAY_NUMBER`). The thirtieth
 *     wave's 1920 default floor (and its below-1920 extension) was
 *     native-attribute-only: a typed 1900-01-01 passes an authored
 *     `max: '1950-…'` validator and submits. The format floor is real
 *     regardless of `noValidate` — the HTML date grammar has no year 0000
 *     or negative years, so a typed year below 1 never parses into a value
 *     at all — and it is the same floor a bound-less picker already
 *     contributes;
 *   - COARSE (month/year) resolutions are UNCHANGED and deliberately
 *     asymmetric: their closed dropdowns admit no typed input, so the
 *     default floor, synthesized far bounds, and clamps of waves 25-32
 *     (`synthesizedCoarseMissingSideBound`) remain true hard domains there.
 *
 * Both replaced bounds only ever WIDEN the modelled window, so every
 * downstream consumer (chain seeds, group intersections, parity
 * qualification, disequality pruning) moves in the accept direction; the
 * one behavioural knock-on is that a window which was enumerable only
 * BECAUSE of the removed bound (still finite now, but wider — an
 * authored-min-only window is [min, 9999-12-31]) can exceed
 * `COARSE_INSTANT_ENUMERATION_CAP` and make an enumeration-backed check
 * bail to accept where it previously judged — accept-safe by construction.
 *
 * Authoredness is judged by `parseRuntimeYmd` — the runtime's own grammar —
 * exactly as `synthesizedCoarseMissingSideBound` judges it, and the call site's
 * `undefined` guards keep a bound the lenient `dayNumber` reads but the
 * runtime rejects in charge of its own edge. A picker with NEITHER authored
 * bound is untouched — no validators exist at all there, so its
 * native-floor-only interval stays exactly as modelled — and a
 * both-authored window is honoured verbatim as before.
 */
const fullResolutionSubmissionFarBound = (
  parameters: UnknownRecord,
): { edge: 'min' | 'max'; day: number } | undefined => {
  const authoredMin = parseRuntimeYmd(parameters.min);
  const authoredMax = parseRuntimeYmd(parameters.max);
  if (authoredMax && !authoredMin) {
    return { edge: 'min', day: NATIVE_DATE_INPUT_FLOOR_DAY_NUMBER };
  }
  if (authoredMin && !authoredMax) {
    return { edge: 'max', day: FOUR_DIGIT_GRAMMAR_CEILING_DAY_NUMBER };
  }
  return undefined;
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
 *
 * Twenty-fifth wave: a COARSE picker with exactly one authored bound outside
 * the default 1920-to-today window additionally closes its missing side at
 * the runtime-synthesized far bound — see `synthesizedCoarseMissingSideBound` and the
 * inline comment below.
 */
const dateWindowInterval = (variable: unknown): Interval | undefined => {
  const record = asRecord(variable);
  if (!record) return undefined;
  const parameters = asRecord(record.parameters);
  // Twenty-fourth-wave Finding 2: an explicit RelativeDatePicker may legally
  // omit `parameters` altogether (`dateTimeRelativeDatePickerSchema` marks
  // the record optional), and the control it renders is identical to one
  // configured with an EMPTY record: fresco-ui's RelativeDatePickerField
  // destructures `before = 180, after = 0` and resolves a missing anchor to
  // `todayYmd()` whether the record was absent or empty. Treating absence as
  // "no window at all" therefore modelled a control the runtime never
  // renders — an absent-parameters picker `greaterThanVariable` an anchorless
  // `{ before: 0, after: 0 }` partner is unsatisfiable (both windows cap at
  // the interview date, and the partner is pinned to it) yet was accepted.
  // `relativeDateWindowInterval` already owns the default handling, so an
  // absent record routes through it as an empty one. (One runtime nuance,
  // noted for honesty: useProtocolForm's submission-time min/max precompute
  // is gated on a PRESENT record today, so the absent case's window is
  // enforced by the control's own native min/max — the same
  // control-determined-domain reading `booleanDomain` and the option-set
  // checks already rely on.) A COMPONENTLESS variable with absent parameters
  // stays unjudged below: with neither a component nor a parameter shape,
  // no control can be identified at all.
  if (record.component === 'RelativeDatePicker') {
    return relativeDateWindowInterval(parameters ?? {});
  }
  // Twenty-sixth-wave Finding 2: an explicit DatePicker with no parameters
  // record at all is a full-resolution picker with no authored bounds — the
  // same native-floor window the no-authored-bounds branch below models. A
  // COMPONENTLESS variable with no parameters stays unjudged: with neither a
  // component nor a parameter shape, no control can be identified at all.
  if (!parameters) {
    return record.component === 'DatePicker'
      ? { min: NATIVE_DATE_INPUT_FLOOR_DAY_NUMBER, origin: 'fixed' }
      : undefined;
  }
  // Audit sweep: a null `component` is an absent one (see `dateResolutionOf`),
  // and testing `=== undefined` here dropped the shape inference entirely,
  // losing the relative window rather than merely mis-reading it.
  if (record.component == null && isRelativeDatePickerShape(parameters)) {
    return relativeDateWindowInterval(parameters);
  }
  const resolution = dateResolutionOf(variable);
  const storesFullDates = resolution === 'full';
  let min =
    typeof parameters.min === 'string'
      ? dayNumber(parameters.min, 'min')
      : undefined;
  let max =
    typeof parameters.max === 'string'
      ? dayNumber(parameters.max, storesFullDates ? 'max' : 'min')
      : undefined;
  // Twenty-sixth-wave Finding 2: a FULL-resolution picker with no authored
  // bound on either side is still not unbounded below — the native
  // `<input type="date">` grammar has no year 0000 or negative years, so
  // nothing before 0001-01-01 can ever be typed or selected whatever the
  // control's `min`/`max` attributes say (see
  // `NATIVE_DATE_INPUT_FLOOR_DAY_NUMBER`). Contributing the floor closes the
  // reviewer's repro (a bound-less required DatePicker `lessThanVariable` a
  // partner pinned AT the floor has no strictly-earlier instant to offer,
  // yet was accepted) while the upper edge stays unbounded. This is a hard
  // FORMAT bound shared by every datetime control, so it holds whichever
  // control a composer field ultimately renders. A COARSE picker with no
  // authored bounds falls through instead: thirtieth-wave Fix 4 models its
  // dropdown's stable default floor below.
  if (min === undefined && max === undefined && storesFullDates) {
    return { min: NATIVE_DATE_INPUT_FLOOR_DAY_NUMBER, origin: 'fixed' };
  }
  // Twenty-fifth wave: a COARSE picker with exactly one authored bound
  // outside the default window is not half-open at runtime — fresco-ui
  // synthesizes the missing side, and the year/month dropdowns are closed
  // option lists, so the synthesized side restricts the domain as hard as an
  // authored one. Thirtieth-wave Fix 4 extends the same reasoning to the
  // dropdowns' DEFAULT lower edge: an unbounded or in-window-max-only coarse
  // window is floored at the stable 1920 default exactly as the runtime
  // floors it, while the date-dependent today side stays unbounded. See
  // `synthesizedCoarseMissingSideBound` for the exact derivation and the
  // conservative handling of its "today" dependence. Thirty-fourth wave
  // (Fix 1): a one-sided FULL-resolution window closes its missing side at
  // the far bound of its SUBMISSION domain — the four-digit grammar ceiling
  // above an authored min, the native format floor below an authored max —
  // NOT at the resolved native attribute, which a `noValidate` form never
  // enforces (see `fullResolutionSubmissionFarBound`). In both arms the
  // `undefined` guards keep an authored-but-differently-parsed bound (the
  // lenient `dayNumber` can read a string the runtime's `parseYmd` rejects)
  // in charge of its own edge, exactly as before.
  if (storesFullDates) {
    const synthesized = fullResolutionSubmissionFarBound(parameters);
    if (min === undefined && synthesized?.edge === 'min') {
      min = synthesized.day;
    } else if (max === undefined && synthesized?.edge === 'max') {
      max = synthesized.day;
    }
  } else {
    const synthesized = synthesizedCoarseMissingSideBound(
      parameters,
      resolution,
    );
    if (min === undefined && synthesized?.edge === 'min') {
      min = periodStartDayNumber(synthesized.period);
    } else if (max === undefined && synthesized?.edge === 'max') {
      max = periodStartDayNumber(synthesized.period);
    }
  }
  // Defensive only: every coarse shape either read or modelled at least one
  // edge above, so an all-undefined interval is unreachable — but a raw
  // migration record that somehow defeats both readings must stay unjudged
  // rather than contribute an unbounded-but-present interval.
  if (min === undefined && max === undefined) return undefined;
  // Twenty-third-wave Finding 6: `datePickerParametersSchema` rejects a
  // year-0-or-earlier full-resolution bound, but that gate never runs over
  // raw (pre-schema) migration input — the same floor `relativeDateWindowInterval`
  // clamps to applies here too (and a synthesized lower edge derived from a
  // very early coarse `max` can walk past year zero the same way a
  // RelativeDatePicker's `anchor - before` can).
  return clampToNativeDateFloor({ min, max, origin: 'fixed' });
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
    // Thirty-third wave: a scalar response always lives on the visual analog
    // scale's fixed normalised range. Unlike boolean — where Boolean and
    // Toggle render different domains, so `booleanDomain` must gate on the
    // stage-effective component — the scalar rendering is DETERMINED at every
    // layer, which is what licenses a record-level interval:
    // `VARIABLE_TYPE_COMPONENTS['scalar']` lists exactly ONE legal control
    // (`VisualAnalogScale`, variable.ts), the scalar schema's own `component`
    // enum admits only that control, a shared form field requires the
    // codebook component outright (schema.ts's `validateFormFieldVariable`),
    // and a NetworkComposer field's override is drawn from the same
    // single-entry list (`validateComposerFieldComponents`) — so no override
    // can ever change the rendered control, and a componentless scalar is as
    // determined as an explicit one. The control's range is equally fixed:
    // fresco-ui's VisualAnalogScaleField defaults `min = 0, max = 1`, the
    // interview forwards only `minLabel`/`maxLabel` from `parameters`
    // (useProtocolForm.tsx), and the scalar `parameters` schema can author
    // nothing else — no protocol configuration reaches `min`/`max`/`step`.
    // The step quantisation this range carries is modelled separately, in
    // the chain pass — see `SCALAR_CHAIN_QUANTUM`.
    case 'scalar':
      return { min: 0, max: 1, origin: 'fixed' };
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
 * `differentFrom` check (fifth-wave Finding 5). `options` are only ever read
 * when the caller vouches that each variable's `component` IS its
 * stage-effective rendering (`stageEffectiveComponents`) AND that component
 * is explicitly `'Boolean'` — see Twenty-first-wave Finding 1 and
 * Twenty-sixth-wave Finding 1 below for why every other case (Toggle, no
 * declared component, or a codebook-level read where no stage is in scope)
 * short-circuits to the unrestricted two-value domain.
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
 * Twenty-sixth-wave Finding 1 extends that same reasoning to an EXPLICIT
 * `component: 'Boolean'` read at the record level. The codebook's declared
 * component is a DEFAULT, not the rendering: `ComposerFormFieldSchema`'s
 * `component` is required and drawn from `VARIABLE_TYPE_COMPONENTS['boolean']`
 * regardless of what the codebook declares, and the interview runtime
 * resolves every composer field as `fieldComponent ?? codebookComponent`
 * (interview's selectors/forms.ts) while keeping the codebook `options` it
 * never renders — so a protocol whose every occurrence of an explicit-Boolean
 * variable overrides the rendering to `Toggle` (unconditionally two-valued)
 * is runtime-satisfiable, yet the record-level pin rejected it, and the
 * v7→v8 migration turned that false rejection into silently stripped rules.
 * The record refinement (`rejectValidationContradictions`, chained onto the
 * variables records) can never see the stages that would settle the question,
 * so options-derived pinning is gated on `stageEffectiveComponents`: only a
 * caller that has already RESOLVED each variable's stage-effective rendering
 * (schema.ts's `validateComposerFieldContradictions` overlay, which writes
 * the winning `component` onto every variable it judges) may pass it, and the
 * record-level check and the migration run with the default and never pin
 * from `options`. A genuine Boolean-rendered singleton `differentFrom` pair
 * is therefore still reported wherever a composer form actually renders it —
 * anchored at the field, once a stage supplies the missing context — while a
 * pair whose only renderers are shared form fields (EgoForm and the other
 * `FormFieldSchema` surfaces, which render the codebook component verbatim
 * but have no stage-effective contradiction pass) is a known accept-direction
 * gap, deliberately preferred over the false rejection.
 */
const booleanDomain = (
  variable: unknown,
  stageEffectiveComponents: boolean,
): Set<boolean> => {
  if (!stageEffectiveComponents) return new Set([true, false]);
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
 * The canonical composite key for a categorical selection SET — the
 * order-insensitive, typeof-tagged, JSON-framed encoding `pinnedValue`'s
 * categorical arm introduced (seventeenth-wave Finding 3: JSON escapes both
 * `KEY_SEPARATOR` and its own delimiters, so no option value can forge
 * another set's key, keeping the encoding injective). Extracted in the
 * thirtieth wave so `sameAsGroupDerivedPin`'s categorical arm produces
 * byte-identical keys — the pinned-equal comparison only ever fires on exact
 * key equality, so the encoding must never be re-derived independently.
 */
const categoricalSetPinKey = (values: Set<string | number>): string => {
  const tokens = [...values]
    .map((value) => JSON.stringify([typeof value, String(value)]))
    .toSorted();
  return `categorical:${JSON.stringify(tokens)}`;
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
 *   - categorical (tenth-wave Finding 2, twenty-third-wave Finding 9): a
 *     selection is a SET of distinct option values, so it pins to a single
 *     possible answer whenever either (a) the distinct-value domain is
 *     itself a singleton — the only non-empty selection is that one value —
 *     or (b) a `minSelected` rule sits at or above the distinct-value count,
 *     forcing selection of ALL of them (strictly above the count is its own
 *     `minSelectedExceedsOptions` class, but >= keeps this robust either
 *     way). The runtime compares categorical arrays as order-insensitive
 *     multisets (fresco-ui's isMatchingValue), so the pinned "value" is a
 *     canonical composite key over the distinct values, typeof-tagged like
 *     isMatchingValue's own keying, sorted, and JSON-framed so no option
 *     value can forge another set's key (seventeenth-wave Finding 3). Keys
 *     are only ever compared between same-typed endpoints
 *     (`usableReference`), so no type's pinned value can collide with
 *     another's. `maxSelected` is irrelevant here: it can only shrink
 *     the feasible set further (a maxSelected below minSelected is its own
 *     `invertedBounds` contradiction), never admit a second answer.
 *
 *     None of these checks — nor the ordinal, number, boolean, or datetime
 *     arms above — gate on `required`. This function's contract is: a
 *     contradiction exists when no ENTERED value can satisfy the rules
 *     together. An unanswered/empty field is outside that model — `required`
 *     owns emptiness, and "this field can never be validly answered" is
 *     exactly the defect `pinnedValue` exists to surface, not a case to
 *     special-case around. (Twenty-third-wave Finding 9 briefly gated the
 *     ordinal arm and a required-only categorical branch on `required`, on
 *     runtime-faithfulness grounds; that broke uniformity with every other
 *     arm here and was reverted — a singleton effective domain pins the
 *     entered value regardless of `required`.)
 *   - text/scalar/layout: no rule on these types ever collapses to one
 *     runtime value.
 */
const pinnedValue = (
  variable: unknown,
  stageEffectiveComponents: boolean,
): string | number | boolean | undefined => {
  switch (typeOf(variable)) {
    case 'number': {
      const min = numberRule(variable, 'minValue');
      const max = numberRule(variable, 'maxValue');
      return min !== undefined && min === max ? min : undefined;
    }
    case 'boolean': {
      const domain = booleanDomain(variable, stageEffectiveComponents);
      return domain.size === 1 ? [...domain][0] : undefined;
    }
    case 'datetime': {
      const resolution = dateResolutionOf(variable);
      if (resolution !== 'full') {
        const parameters = asRecord(asRecord(variable)?.parameters);
        // A present bound that does not match the picker's own resolution is
        // malformed rather than pinning (the schema rejects it separately),
        // and the analyser also runs over raw migration input.
        if (
          !parameters ||
          (parameters.min !== undefined &&
            (typeof parameters.min !== 'string' ||
              !isValidDateAtResolution(parameters.min, resolution))) ||
          (parameters.max !== undefined &&
            (typeof parameters.max !== 'string' ||
              !isValidDateAtResolution(parameters.max, resolution)))
        ) {
          return undefined;
        }
        const window = dateWindowInterval(variable);
        if (
          window?.origin !== 'fixed' ||
          window.min === undefined ||
          window.min !== window.max
        ) {
          return undefined;
        }
        return storedPinKeyAtDay(window.min, resolution);
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
      if (values === undefined || values.size === 0) {
        return undefined;
      }
      const minSelected = numberRule(variable, 'minSelected');
      // A singleton distinct-value domain pins outright (see the doc comment
      // above `pinnedValue`); otherwise fall back to the pre-existing
      // minSelected-at-or-above-count cardinality check.
      const pinned =
        values.size === 1 ||
        (minSelected !== undefined && minSelected >= values.size);
      if (!pinned) {
        return undefined;
      }
      // Seventeenth-wave Finding 3: the canonical JSON-framed set key —
      // extracted to `categoricalSetPinKey` so the thirtieth wave's group-pin
      // arm shares the exact encoding rather than re-deriving it.
      return categoricalSetPinKey(values);
    }
    default:
      return undefined;
  }
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
 * Twenty-seventh-wave Finding 1: the single value a sameAs component's
 * members are COLLECTIVELY forced to hold when no member's own rules pin it
 * alone. `A [0,1] sameAs D [1,3]` forces both to exactly 1 — the group's
 * intersected window collapses to one point — yet neither member's own
 * `pinnedValue` fires, so `sameAsInheritedPins` below had nothing to inherit
 * and the pin was invisible to the pinned-equal `differentFrom` check. The
 * derivation mirrors `pinnedValue`'s own per-type encodings exactly, and
 * every uncertainty returns `undefined` (accept):
 *
 *   - number: the intersected minValue/maxValue window collapsing to one
 *     point pins that number — the same numeric key `pinnedValue` returns.
 *   - datetime: only when every member window lives on ONE origin and the
 *     members share FULL resolution. A full-resolution collapse point is a
 *     day number inside every member's own window (it is their
 *     intersection), so the origin-tagged `datetime:${origin}:${day}` key is
 *     exactly the key `pinnedValue` derives when a single member's window
 *     collapses. A pin is never synthesized across origins — a two-origin
 *     group has no single collapsed window to read, and its members'
 *     `pinnedValue` keys would not even share a tag. Twenty-ninth wave: a
 *     uniformly COARSE (all-year or all-month) fixed-origin group pins too,
 *     when the intersection of its members' exact emission sets
 *     (`coarseInstantsOf`, enumeration cap included) contains exactly ONE
 *     instant with a canonical stored form — required year pickers spanning
 *     2020-2021 and 2021-2022 can each only emit '2021', a collapse the
 *     day-number window maths above cannot see as a STORED-STRING key. The
 *     key is `pinnedValue`'s own coarse encoding, via `storedPinKeyAtDay`
 *     (which reuses `coarseStoredValueAtDay` rather than re-deriving the
 *     encoding), so it compares exactly against a coarse partner's own pin.
 *     Everything else still derives nothing: an unenumerable or over-cap
 *     window, an instant with no canonical stored form (unpadded year), zero
 *     surviving instants (at one resolution that means the convex windows
 *     are already disjoint, so the group-emptiness machinery reports it —
 *     never doubled here) or more than one — and mixed resolutions never
 *     reach here at all, the caller defers them to the mixed-resolution
 *     machinery.
 *   - ordinal: the intersection of every member's distinct option values
 *     collapsing to one value pins it — single-select, so that value is the
 *     only one every member can store, keyed as the genuine primitive
 *     exactly like `pinnedValue`'s ordinal arm.
 *   - categorical (thirtieth wave): every member's stored selection is a
 *     subset of the members' shared distinct-value intersection (a value not
 *     every member offers can never be the group's shared answer), and the
 *     group's merged `minSelected` floor — the fixed-origin interval's `min`,
 *     the max across members, exactly the read `optionShortfall` documents —
 *     forces at least that many selections. When the floor reaches the
 *     intersection's size, the only selection left is the WHOLE shared set,
 *     keyed via `categoricalSetPinKey` — `pinnedValue`'s own encoding, never
 *     re-derived. A floor below the intersection size derives nothing (two
 *     different selections remain), an empty intersection is the
 *     group-emptiness machinery's (`optionsDisjoint` reports it and poisons
 *     the group before this derivation ever runs), and a merged
 *     `maxSelected` ceiling below the floor empties the merged interval —
 *     also the emptiness machinery's, and additionally guarded here by
 *     declining to pin from a group whose own merged interval is empty.
 *   - text and every other type derive nothing: a text length-window
 *     collapse does not pin a VALUE at all.
 */
const sameAsGroupDerivedPin = (
  variables: UnknownRecord,
  members: string[],
  type: string,
): string | number | undefined => {
  if (type === 'number' || type === 'datetime') {
    const intervals = intervalsOfMembers(variables, members);
    if (intervals.size !== 1) return undefined;
    const [entry] = intervals;
    if (entry === undefined) return undefined;
    const [origin, interval] = entry;
    if (type === 'datetime') {
      const resolutions = new Set(
        members.map((member) => dateResolutionOf(variables[member])),
      );
      const [resolution] = resolutions;
      if (resolutions.size !== 1) return undefined;
      if (resolution === 'month' || resolution === 'year') {
        // Twenty-ninth wave: a uniformly coarse group pins when the
        // intersection of its members' exact emission sets holds exactly one
        // instant with a canonical stored form (see the doc comment above).
        // Coarse resolution structurally implies a fixed-origin DatePicker
        // window, so the origin check is defensive, matching the file's
        // treatment of raw migration input.
        if (origin !== 'fixed') return undefined;
        let instants: Set<number> | undefined;
        for (const member of members) {
          const coarse = coarseInstantsOf(variables[member]);
          if (coarse === 'unenumerable' || coarse === undefined) {
            return undefined;
          }
          instants =
            instants === undefined
              ? coarse
              : intersectInstantSets(instants, coarse);
        }
        if (instants === undefined || instants.size !== 1) return undefined;
        const [day] = instants;
        if (day === undefined) return undefined;
        return storedPinKeyAtDay(day, resolution);
      }
      if (resolution !== 'full') return undefined;
    }
    if (interval.min === undefined || interval.min !== interval.max) {
      return undefined;
    }
    if (type === 'number') return interval.min;
    return `datetime:${origin}:${interval.min}`;
  }
  if (type === 'ordinal') {
    const shared = sharedOptionValues(variables, members);
    if (shared?.type !== 'ordinal' || shared.values.size !== 1) {
      return undefined;
    }
    const [value] = shared.values;
    return value;
  }
  if (type === 'categorical') {
    const shared = sharedOptionValues(variables, members);
    if (shared?.type !== 'categorical' || shared.values.size === 0) {
      return undefined;
    }
    const intervals = intervalsOfMembers(variables, members);
    // An empty merged cardinality window (a member's maxSelected under
    // another's minSelected) is the group-emptiness machinery's to report;
    // its repair strips the grouping edges, so no pin may be derived from it
    // meanwhile. Normally unreachable — such a group is already in
    // `unsatisfiableGroupMemberIds` and the caller skips it — but guarded
    // here so this derivation never depends on that ordering.
    if (hasEmptyOrigin(intervals)) return undefined;
    const floor = intervals.get('fixed')?.min;
    if (floor === undefined || floor < shared.values.size) return undefined;
    return categoricalSetPinKey(shared.values);
  }
  return undefined;
};

/**
 * Twenty-fourth-wave Finding 1: the pinned value a variable INHERITS through
 * its sameAs-only component, for the pinned-equal `differentFrom` check
 * below. `pinnedValue` reads one variable's OWN rules, so a variable with no
 * bounds of its own but `sameAs`-joined to a pinned member was judged
 * unpinned — `A` pinned to 0 with `A.sameAs = C`, plus `C.differentFrom = D`
 * with `D` pinned to 0, reported nothing although `sameAs` forces C to store
 * A's only value. A pin may travel a `sameAs` edge because `sameAs` forces
 * the two STORED values identical (fresco-ui's `isMatchingValue` — the same
 * distinction `sameAsOnlyUnionFind` documents); it must NOT travel a
 * non-strict comparator edge for this check, because a comparator SCC only
 * forces `compareVariables` equality — for datetime, two stored-distinct
 * strings can compare equal through `new Date(...)`, and `differentFrom`
 * compares stored values. Pin keys are carried VERBATIM (origin-tagged
 * datetime keys, JSON-framed categorical set keys), never re-derived at the
 * inheriting member, so two origins or resolutions are never conflated.
 *
 * Every ambiguity falls back to "no pin" (accept):
 *   - a component whose pinned members DISAGREE contributes nothing — that
 *     conflict is the existing group machinery's to report, and judging a
 *     `differentFrom` against either candidate would double-report it;
 *   - a component touching a group the group-level emptiness checks reported
 *     (`unsatisfiableGroupMemberIds`) contributes nothing — that report's
 *     repair may strip the very sameAs edges the pin would travel, after
 *     which the freed member's `differentFrom` is satisfiable again (the
 *     same "don't judge against an already-empty group" precedent the
 *     per-edge bound check follows);
 *   - a member whose `sameAs` and `differentFrom` name one target is
 *     class 7's (`conflictingReferencePair`), whose repair strips that
 *     sameAs edge, so its component contributes nothing;
 *   - a datetime component with MIXED resolutions contributes nothing — the
 *     mixed-resolution check strips its cross-resolution sameAs edges, and a
 *     pin key inherited across resolutions could match a coarse partner the
 *     freed member can genuinely differ from;
 *   - boolean components contribute nothing: boolean pins against the
 *     `differentFrom` graph belong to the domain-aware parity check, which
 *     already reads pins at merged-group granularity via
 *     `sharedBooleanDomain`, so inheriting here would only re-class its
 *     reports.
 *
 * Twenty-seventh-wave Finding 1: a component NONE of whose members carries an
 * own pin can still be pinned collectively — its intersected window (or
 * shared option domain) collapsing to a single value forces every member to
 * that value just as hard as a member pin does. `sameAsGroupDerivedPin`
 * derives that group pin, under this function's same guards.
 */
function sameAsInheritedPins(
  variables: UnknownRecord,
  sameAsFind: (id: string) => string,
  unsatisfiableGroupMemberIds: ReadonlySet<string>,
  stageEffectiveComponents: boolean,
): Map<string, string | number | boolean> {
  const membersOf = new Map<string, string[]>();
  for (const id of Object.keys(variables)) {
    const root = sameAsFind(id);
    const members = membersOf.get(root) ?? [];
    members.push(id);
    membersOf.set(root, members);
  }

  const inherited = new Map<string, string | number | boolean>();
  for (const members of membersOf.values()) {
    if (members.length < 2) continue;
    if (
      members.some((member) => unsatisfiableGroupMemberIds.has(member)) ||
      members.some((member) => {
        const sameAs = referenceRule(variables[member], 'sameAs');
        return (
          sameAs !== undefined &&
          sameAs === referenceRule(variables[member], 'differentFrom')
        );
      })
    ) {
      continue;
    }
    // `usableReference` only ever unions same-typed variables, so the Set is
    // defensive, matching the rest of the file.
    const types = new Set(members.map((member) => typeOf(variables[member])));
    const [onlyType] = types;
    if (types.size !== 1 || onlyType === undefined || onlyType === 'boolean') {
      continue;
    }
    if (
      onlyType === 'datetime' &&
      new Set(members.map((member) => dateResolutionOf(variables[member])))
        .size > 1
    ) {
      continue;
    }

    let pin: string | number | boolean | undefined;
    let disagreement = false;
    const unpinned: string[] = [];
    for (const member of members) {
      const own = pinnedValue(variables[member], stageEffectiveComponents);
      if (own === undefined) {
        unpinned.push(member);
      } else if (pin === undefined) {
        pin = own;
      } else if (pin !== own) {
        disagreement = true;
      }
    }
    if (disagreement) continue;
    // Twenty-seventh-wave Finding 1: with no member pinned by its own rules,
    // the group's INTERSECTED constraints can still collapse to one value —
    // that value is the group's pin, inherited by every member exactly as a
    // member's own pin is.
    pin ??= sameAsGroupDerivedPin(variables, members, onlyType);
    if (pin === undefined) continue;
    for (const member of unpinned) inherited.set(member, pin);
  }
  return inherited;
}

/**
 * Thirty-fourth wave (Fix 2), extended for uniform full dates: the pinned
 * value a variable inherits through its comparator-MERGED equality group. The
 * original number repro: `B`
 * pinned to 2, `C` spanning [2, 3], mutual non-strict comparators forcing
 * `B = C`, and `C differentFrom A` with `A` pinned to 2 — `C` is forced to
 * hold exactly 2, yet neither existing pin source sees it:
 * `sameAsInheritedPins` scopes to sameAs-only components (no sameAs edge
 * joins B and C), and `chainedBoundContradictions` builds propagation nodes
 * only for groups on CROSS-group comparator edges (its adjacency comes from
 * `graph.dependencies`), so a merged group whose comparators are all
 * internal never receives a propagated pin.
 *
 * A pin may travel a non-strict comparator SCC for number variables, by the
 * same per-type argument class 9's carve-out records
 * (`referenceStructureContradictions`, twenty-second-wave Finding 3): the
 * comparator equality the SCC forces is `compareVariables`' `Number()`
 * equality, and a number has no second textual representation of the same
 * quantity, so comparator-equal IS stored-equal — exactly what
 * `differentFrom`'s `isMatchingValue` compares. Uniform full-resolution
 * datetime groups on one shared origin qualify for the same reason: every
 * control stores the canonical full date, so Date-equal is stored-equal.
 * Mixed resolutions and origins still derive nothing because either can
 * compare equal while storing a different value, or cannot be related
 * without knowing the interview date. Every other type stays out:
 *
 *   - scalar's comparator equality would be equally exact, but its
 *     validation pick carries no `differentFrom`/`sameAs` and no value
 *     bounds, and `pinnedValue` never pins one, so there is nothing to
 *     derive (the chain pass records nothing for scalar collapses for the
 *     same no-consumer reason);
 *   - text/boolean/ordinal/categorical have no comparator rules at all
 *     (`requireType` on the four comparator rules), so comparator-merged
 *     groups of those types cannot exist.
 *
 * The derivation and guards mirror `sameAsInheritedPins` exactly: a group
 * touching `unsatisfiableGroupMemberIds` contributes nothing (its
 * emptiness repair may strip the very edges the pin would travel), a
 * member whose `sameAs` and `differentFrom` name one target keeps its
 * group out (class 7's repair strips that sameAs edge), disagreeing member
 * pins derive nothing (the group machinery's conflict to report), and with
 * no member pinned the group's INTERSECTED interval collapsing to a point
 * pins every member (`sameAsGroupDerivedPin`). The consumer
 * below applies these pins only across two DISTINCT merged groups — a
 * `differentFrom` inside one merged group is class 9's report.
 */
function comparatorMergedGroupInheritedPins(
  variables: UnknownRecord,
  membersOf: Map<string, string[]>,
  unsatisfiableGroupMemberIds: ReadonlySet<string>,
  stageEffectiveComponents: boolean,
): Map<string, string | number> {
  const inherited = new Map<string, string | number>();
  for (const members of membersOf.values()) {
    if (members.length < 2) continue;
    if (
      members.some((member) => unsatisfiableGroupMemberIds.has(member)) ||
      members.some((member) => {
        const sameAs = referenceRule(variables[member], 'sameAs');
        return (
          sameAs !== undefined &&
          sameAs === referenceRule(variables[member], 'differentFrom')
        );
      })
    ) {
      continue;
    }
    const types = new Set(members.map((member) => typeOf(variables[member])));
    const [onlyType] = types;
    if (
      types.size !== 1 ||
      (onlyType !== 'number' && onlyType !== 'datetime')
    ) {
      continue;
    }
    if (onlyType === 'datetime') {
      if (
        members.some((member) => dateResolutionOf(variables[member]) !== 'full')
      ) {
        continue;
      }
      const origins = new Set<IntervalOrigin>();
      let missingOrigin = false;
      for (const member of members) {
        const origin = dateWindowInterval(variables[member])?.origin;
        if (origin === undefined) {
          missingOrigin = true;
          break;
        }
        origins.add(origin);
      }
      if (missingOrigin || origins.size !== 1) continue;
    }

    let pin: string | number | undefined;
    let disagreement = false;
    const unpinned: string[] = [];
    for (const member of members) {
      const own = pinnedValue(variables[member], stageEffectiveComponents);
      if (own === undefined) {
        unpinned.push(member);
      } else if (onlyType === 'number' && typeof own === 'number') {
        if (pin === undefined) {
          pin = own;
        } else if (pin !== own) {
          disagreement = true;
        }
      } else if (onlyType === 'datetime' && typeof own === 'string') {
        if (pin === undefined) {
          pin = own;
        } else if (pin !== own) {
          disagreement = true;
        }
      } else {
        // The pin encoding must agree with the group's type; anything else is
        // outside the model, so the group derives nothing (defensive).
        disagreement = true;
      }
    }
    if (disagreement) continue;
    const derived = pin ?? sameAsGroupDerivedPin(variables, members, onlyType);
    if (onlyType === 'number') {
      if (typeof derived !== 'number') continue;
      for (const member of unpinned) inherited.set(member, derived);
    } else {
      if (typeof derived !== 'string') continue;
      for (const member of unpinned) inherited.set(member, derived);
    }
  }
  return inherited;
}

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
 *
 * Twenty-second-wave Finding 1: `propagatedPins` — the chain-propagation
 * pass's own tightened-bound closure (`chainedBoundContradictions`) — is
 * consulted as a FALLBACK once a variable's OWN `pinnedValue` comes up
 * undefined. `pinnedValue` only ever looks at a variable's own rules, so a
 * pair each individually unpinned but forced to one shared value by a
 * comparator chain plus the other's own bound (the reviewer's `A.maxValue =
 * 0`, `D.minValue = 0`, `D.maxValue = 1`, `D <= A` shape) was invisible here.
 * Threading the ALREADY-COMPUTED closure through, rather than re-deriving it,
 * avoids running the propagation pass twice; see `findValidationContradictions`
 * for the plumbing.
 *
 * Twenty-fourth-wave Finding 1: `sameAsInheritedPins` (above) is the second
 * fallback — a pin forced onto a variable by a `sameAs` edge to a pinned
 * group member. Inherited pins only ever apply across two DISTINCT sameAs
 * components: a `differentFrom` whose both ends share one component is
 * class 9's (`sameAsGroupConflict`), and judging it here too would
 * double-report a single rule.
 *
 * Thirty-fourth wave (Fix 2), extended for uniform full dates:
 * `comparatorMergedGroupInheritedPins` (above) is the third fallback — a pin
 * forced onto a number or eligible datetime variable by its comparator-merged
 * equality group's member pins or collapsed intersected interval. It applies
 * only across two DISTINCT merged groups for the same no-double-report reason:
 * a `differentFrom` inside one merged group — whether joined by sameAs or by a
 * comparator SCC — is class 9's report.
 */
function pinnedEqualDifferentFromContradictions(
  variables: UnknownRecord,
  propagatedPins: Map<string, string | number>,
  unsatisfiableGroupMemberIds: ReadonlySet<string>,
  stageEffectiveComponents: boolean,
): {
  contradictions: ValidationContradiction[];
  claimedPairs: Set<string>;
} {
  const { find: sameAsFind } = sameAsOnlyUnionFind(variables);
  const inheritedPins = sameAsInheritedPins(
    variables,
    sameAsFind,
    unsatisfiableGroupMemberIds,
    stageEffectiveComponents,
  );
  const { groupOf: mergedGroupOf, membersOf: mergedMembersOf } =
    buildEqualityGroups(variables, comparatorEdges(variables));
  const mergedPins = comparatorMergedGroupInheritedPins(
    variables,
    mergedMembersOf,
    unsatisfiableGroupMemberIds,
    stageEffectiveComponents,
  );
  const conflicts = new Map<string, VariableRuleRef[]>();

  for (const [id, variable] of Object.entries(variables)) {
    const target = usableReference(variables, id, 'differentFrom');
    if (target === undefined || target === id) continue;
    const crossComponent = sameAsFind(id) !== sameAsFind(target);
    const crossMergedGroup =
      mergedGroupOf.get(id) !== mergedGroupOf.get(target);
    const valueA =
      pinnedValue(variable, stageEffectiveComponents) ??
      (crossComponent ? inheritedPins.get(id) : undefined) ??
      (crossMergedGroup ? mergedPins.get(id) : undefined) ??
      propagatedPins.get(id);
    const valueB =
      pinnedValue(variables[target], stageEffectiveComponents) ??
      (crossComponent ? inheritedPins.get(target) : undefined) ??
      (crossMergedGroup ? mergedPins.get(target) : undefined) ??
      propagatedPins.get(target);
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

/**
 * The available boolean values every member of an all-boolean member list
 * offers; `undefined` when the list is not uniformly boolean.
 */
const sharedBooleanDomain = (
  variables: UnknownRecord,
  members: string[],
  stageEffectiveComponents: boolean,
): Set<boolean> | undefined => {
  const types = new Set(members.map((member) => typeOf(variables[member])));
  const [onlyType] = types;
  if (types.size !== 1 || onlyType !== 'boolean') return undefined;
  let intersection: Set<boolean> | undefined;
  for (const member of members) {
    const domain = booleanDomain(variables[member], stageEffectiveComponents);
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
 * Twenty-seventh-wave Finding 2: the canonical stored string a coarse
 * (month/year) DatePicker holds when the instant `compareVariables` reads
 * back from it is exactly `day` — the inverse of `dayNumber`'s 'min'-edge
 * reading (a bare year parses to 1 January, a bare month to the 1st).
 * `undefined` whenever `day` is not exactly one representable coarse
 * emission: a fractional or mid-period day number (no stored string parses
 * to it), or a year outside 1000-9999. That year bracket is the unpadded-year
 * caveat: the coarse year dropdown stores `y.toString()` with NO zero-padding
 * (fresco-ui DatePicker.tsx's own COARSE_MIN_YEAR/COARSE_MAX_YEAR carve out
 * the same range), so only a year whose unpadded form already satisfies the
 * schema's four-digit YYYY grammar round-trips as a stored value — a smaller
 * or larger year has no canonical encoding to pin. The month part is
 * zero-padded ('01'-'12'), matching both the runtime's month option values
 * and the YYYY-MM bound grammar, so the returned string is byte-identical to
 * the authored bound `pinnedValue`'s coarse branch keys a pinned partner by.
 */
const coarseStoredValueAtDay = (
  day: number,
  resolution: 'month' | 'year',
): string | undefined => {
  if (!Number.isInteger(day)) return undefined;
  const date = new Date(day * 86_400_000);
  const year = date.getUTCFullYear();
  if (
    date.getUTCDate() !== 1 ||
    (resolution === 'year' && date.getUTCMonth() !== 0) ||
    year < COARSE_SYNTHESIS_MIN_YEAR ||
    year > COARSE_SYNTHESIS_MAX_YEAR
  ) {
    return undefined;
  }
  return resolution === 'year'
    ? String(year)
    : `${String(year)}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
};

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
 * its window cannot be safely enumerated — an open bound (no authored min or
 * max on that side and no modelled bound either — see
 * `synthesizedCoarseMissingSideBound`; since thirtieth-wave Fix 4 the MIN
 * side is always modelled when unauthored, so in practice this is the
 * date-dependent today side) or a window wider than
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
  if (!parameters) return 'unenumerable';
  // Twenty-fifth wave: the bound the runtime resolves for a coarse window's
  // missing side closes that window as hard as an authored bound does (the
  // dropdowns offer nothing beyond it), so it bounds this enumeration too —
  // including, since thirtieth-wave Fix 4, the stable 1920 default floor of
  // an unauthored min side. The modelled periods are a SUPERSET of what the
  // runtime offers on any in-horizon interview date (the default floor is
  // exact; see `synthesizedCoarseMissingSideBound`), which is the safe
  // direction for both consumers: `discreteInstantsEmpty` only reports once
  // even the superset intersection is empty, and `roundToCoarseEmission`
  // rounding against extra periods can only land a LOOSER bound than the
  // runtime-exact one. An out-of-window synthesized window only fits
  // `COARSE_INSTANT_ENUMERATION_CAP` at YEAR resolution (a month one spans
  // ~2,400 periods); over-cap cases stay 'unenumerable' via the cap below,
  // falling back to the convex interval that `dateWindowInterval` also
  // closes.
  const synthesized = synthesizedCoarseMissingSideBound(parameters, resolution);
  const minPeriod =
    (typeof parameters.min === 'string'
      ? parseCoarseBound(parameters.min, resolution)
      : undefined) ??
    (synthesized?.edge === 'min' ? synthesized.period : undefined);
  const maxPeriod =
    (typeof parameters.max === 'string'
      ? parseCoarseBound(parameters.max, resolution)
      : undefined) ??
    (synthesized?.edge === 'max' ? synthesized.period : undefined);
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
 * all, makes this return `undefined` — never "empty" — so its emptiness
 * consumer can only ever ADD a detection the interval check missed, never
 * invent a false rejection of its own.
 *
 * Twenty-seventh-wave Finding 3 extracted this SET computation from
 * `discreteInstantsEmpty` (below) so the comparator-feasibility passes can
 * consume the surviving set itself — its hull is the group's true reachable
 * range — rather than only its emptiness. The `exact` flag serves that new
 * consumer: a member whose window lives on the symbolic 'interviewDate'
 * origin, or that identifies no window at all, contributes NO fixed-calendar
 * filter here, which is sound for the emptiness consumer (fewer filters only
 * ever ACCEPT more) but the hull consumer TIGHTENS intervals with the
 * result, so under `exact` any such unrepresented member makes the whole set
 * unusable (`undefined`) instead — the convex interval stays in charge.
 */
const survivingDiscreteInstants = (
  variables: UnknownRecord,
  subset: string[],
  exact: boolean,
): Set<number> | undefined => {
  if (subset.length < 2) return undefined;
  const types = new Set(subset.map((member) => typeOf(variables[member])));
  const [onlyType] = types;
  if (types.size !== 1 || onlyType !== 'datetime') return undefined;

  let candidates: Set<number> | undefined;
  const fixedIntervals: Interval[] = [];
  for (const member of subset) {
    const variable = variables[member];
    const coarse = coarseInstantsOf(variable);
    if (coarse === 'unenumerable') return undefined;
    if (coarse === undefined) {
      const interval = dateWindowInterval(variable);
      if (interval?.origin === 'fixed') {
        fixedIntervals.push(interval);
      } else if (exact) {
        return undefined;
      }
      continue;
    }
    candidates =
      candidates === undefined
        ? coarse
        : intersectInstantSets(candidates, coarse);
  }
  // No coarse member: the interval check is already exact for a group with
  // no coarse resolution in play, so there is nothing further to model.
  if (candidates === undefined) return undefined;

  for (const interval of fixedIntervals) {
    candidates = new Set(
      [...candidates].filter(
        (day) =>
          (interval.min === undefined || day >= interval.min) &&
          (interval.max === undefined || day <= interval.max),
      ),
    );
  }
  return candidates;
};

/**
 * Whether a subset's surviving discrete instant set is computable and EMPTY —
 * the group-level emptiness consumer of `survivingDiscreteInstants` above.
 * The caller only ever consults this once the interval check has already
 * found the group non-empty, so a group this DOES flag is reported exactly
 * once.
 */
const discreteInstantsEmpty = (
  variables: UnknownRecord,
  subset: string[],
): boolean => survivingDiscreteInstants(variables, subset, false)?.size === 0;

/**
 * Whether a member list contains a cross-resolution `sameAs` edge. Such a
 * group is the mixed-resolution machinery's to report — its repair strips
 * exactly those edges, after which the members separate — so neither the
 * surviving-instant hull nor the pinned-disequality pruning (twenty-eighth
 * wave) may judge comparators against the joint domain meanwhile. Extracted
 * from `tightenToSurvivingInstantHull` so both tightenings share one guard.
 */
const hasCrossResolutionSameAsEdge = (
  variables: UnknownRecord,
  members: string[],
): boolean =>
  members.some((member) => {
    const target = usableReference(variables, member, 'sameAs');
    return (
      target !== undefined &&
      dateResolutionOf(variables[member]) !==
        dateResolutionOf(variables[target])
    );
  });

/**
 * Twenty-seventh-wave Finding 3: tightens an equality group's fixed-origin
 * interval to the hull of its surviving discrete instants, so the comparator
 * feasibility checks — the per-edge check and the chained propagation, which
 * both read these intervals — judge the group by the range it can ACTUALLY
 * reach rather than by its convex approximation. A year picker spanning
 * 2020-2021 held equal (mutual non-strict comparators) to a full picker
 * spanning 2020-01-01–2020-01-02 can only ever share 2020-01-01, yet the
 * convex intersection retained 2020-01-02 as its maximum — so a year picker
 * B with `B < (that node)` looked satisfiable although no year instant lies
 * below 2020-01-01. The hull is a superset of the group's feasible shared
 * values (every member's modelled emission set is itself a superset of its
 * runtime emissions), so a comparator found infeasible against it is
 * genuinely infeasible.
 *
 * Every uncertainty keeps the convex interval as-is (accept):
 *   - a surviving set that cannot be computed EXACTLY — an over-cap or open
 *     coarse window, an interview-date-origin or windowless member, no
 *     coarse member at all (see `survivingDiscreteInstants`'s `exact` mode);
 *   - an EMPTY surviving set — that group is already reported by the
 *     group-level `discreteInstantsEmpty` check, whose repair strips the
 *     grouping edges themselves; there is no hull to represent, and the
 *     per-edge check's "never judge against an already-empty group"
 *     precedent applies;
 *   - a group containing a cross-resolution `sameAs` edge — the
 *     mixed-resolution machinery reports that, and its repair strips exactly
 *     those edges, after which the members separate and the hull no longer
 *     binds them; judging comparators against it meanwhile could strip a
 *     rule the mixed-resolution repair was about to rescue.
 */
const tightenToSurvivingInstantHull = (
  variables: UnknownRecord,
  members: string[],
  intervals: GroupIntervals,
): void => {
  if (hasCrossResolutionSameAsEdge(variables, members)) return;
  const surviving = survivingDiscreteInstants(variables, members, true);
  if (surviving === undefined || surviving.size === 0) return;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const instant of surviving) {
    if (instant < min) min = instant;
    if (instant > max) max = instant;
  }
  addToGroupIntervals(intervals, { min, max, origin: 'fixed' });
};

/**
 * Twenty-eighth wave: the pin key (`pinnedValue`'s own encoding) a datetime
 * variable at `resolution` holds when the fixed-calendar instant
 * `compareVariables` reads back from its stored value is exactly `day`, or
 * `undefined` when no stored value at that resolution reads back to `day`.
 * Full resolution stores the canonical YYYY-MM-DD of the day, keyed on the
 * 'fixed' origin exactly as `pinnedValue`'s full-resolution arm keys a
 * collapsed calendar window; a coarse resolution stores the canonical
 * truncated string `coarseStoredValueAtDay` derives (or nothing, when `day`
 * is not one of its representable emissions). Comparing a counterpart's pin
 * key against these member-side keys is what keeps the pruning below
 * resolution- and origin-honest: a coarse pin can never match a full
 * member's key, and a symbolic interview-date pin
 * (`datetime:interviewDate:…`) matches no fixed-domain key at all.
 */
const storedPinKeyAtDay = (
  day: number,
  resolution: DateResolution,
): string | undefined => {
  if (resolution === 'full') return `datetime:fixed:${day}`;
  const stored = coarseStoredValueAtDay(day, resolution);
  return stored === undefined ? undefined : `datetime:${resolution}:${stored}`;
};

/**
 * Twenty-eighth wave: the exact, bounded set of fixed-origin day-number
 * instants an equality group's shared value can take, or `undefined` when it
 * cannot be enumerated safely (accept). Coarse members contribute their
 * discrete emission sets (`coarseInstantsOf`, cap included); a group with no
 * coarse member enumerates the integer days of its already-tightened fixed
 * interval, capped at the same `COARSE_INSTANT_ENUMERATION_CAP`. Any member
 * that cannot be represented on the fixed calendar — an unenumerable coarse
 * window, or a full-resolution member without a fixed-origin window (a
 * windowless variable, or an anchorless RelativeDatePicker on the symbolic
 * interview-date origin) — makes the whole domain unenumerable, the same
 * `exact`-mode discipline `survivingDiscreteInstants` applies for its hull
 * consumer. The result is a SUPERSET of the group's feasible shared values
 * (each member's modelled emission set is itself a superset of its runtime
 * emissions), which is the only property both consumers below need.
 */
const enumerableFixedDomain = (
  variables: UnknownRecord,
  members: string[],
  fixedInterval: Interval | undefined,
): Set<number> | undefined => {
  let candidates: Set<number> | undefined;
  for (const member of members) {
    const coarse = coarseInstantsOf(variables[member]);
    if (coarse === 'unenumerable') return undefined;
    if (coarse === undefined) {
      if (dateWindowInterval(variables[member])?.origin !== 'fixed') {
        return undefined;
      }
      continue;
    }
    candidates =
      candidates === undefined
        ? coarse
        : intersectInstantSets(candidates, coarse);
  }
  if (candidates !== undefined) {
    if (fixedInterval === undefined) return candidates;
    return new Set(
      [...candidates].filter(
        (day) =>
          (fixedInterval.min === undefined || day >= fixedInterval.min) &&
          (fixedInterval.max === undefined || day <= fixedInterval.max),
      ),
    );
  }
  if (
    fixedInterval?.min === undefined ||
    fixedInterval.max === undefined ||
    !Number.isInteger(fixedInterval.min) ||
    !Number.isInteger(fixedInterval.max)
  ) {
    return undefined;
  }
  const count = fixedInterval.max - fixedInterval.min + 1;
  if (count <= 0 || count > COARSE_INSTANT_ENUMERATION_CAP) return undefined;
  const domain = new Set<number>();
  for (let day = fixedInterval.min; day <= fixedInterval.max; day++) {
    domain.add(day);
  }
  return domain;
};

/**
 * A `differentFrom` rule instance seen from one equality group's side: the
 * group member whose stored value the rule constrains, and the counterpart
 * outside the group whose pin (if any) that member can therefore never hold.
 */
type PinnedDisequalityEdge = {
  member: string;
  counterpart: string;
  source: VariableRuleRef;
};

/**
 * Twenty-eighth wave: every usable datetime `differentFrom` edge, bucketed by
 * BOTH endpoints' equality groups (each side is the constrained member from
 * its own group's perspective). Same-group pairs are excluded — those are
 * class 9's territory (`sameAsGroupConflict`, or its deliberate
 * divergent-resolution carve-out) — as is a rule whose owner also names the
 * same target with `sameAs`: that pair is class 7's
 * (`conflictingReferencePair`), whose repair strips this very rule, so it
 * must not prune meanwhile.
 *
 * A pair whose two groups are ALSO joined by a comparator edge is excluded
 * too: the counterpart's pin already reaches the member's group as an
 * interval bound through that edge, so the chain propagation collapses the
 * group onto the pin and `pinnedEqualDifferentFromContradictions` reports
 * the pair via its propagated-pin fallback, stripping the `differentFrom`
 * itself (twenty-seventh-wave Finding 2's established behaviour). Pruning
 * the same pin would preempt that collapse and re-class the report onto the
 * comparator — a worse strip for the same conflict. The disequality pruning
 * therefore handles exactly the pins the comparator graph cannot see.
 */
const datetimeDisequalitiesByGroup = (
  variables: UnknownRecord,
  groupOf: Map<string, string>,
  dependencies: Map<string, Map<string, GroupEdge>>,
): Map<string, PinnedDisequalityEdge[]> => {
  const byGroup = new Map<string, PinnedDisequalityEdge[]>();
  const add = (group: string, edge: PinnedDisequalityEdge): void => {
    const bucket = byGroup.get(group) ?? [];
    bucket.push(edge);
    byGroup.set(group, bucket);
  };
  for (const [id, variable] of Object.entries(variables)) {
    if (typeOf(variable) !== 'datetime') continue;
    const target = usableReference(variables, id, 'differentFrom');
    if (target === undefined || target === id) continue;
    if (referenceRule(variable, 'sameAs') === target) continue;
    const groupA = groupOf.get(id);
    const groupB = groupOf.get(target);
    if (groupA === undefined || groupB === undefined || groupA === groupB) {
      continue;
    }
    if (
      dependencies.get(groupA)?.has(groupB) === true ||
      dependencies.get(groupB)?.has(groupA) === true
    ) {
      continue;
    }
    const source: VariableRuleRef = { variableId: id, rule: 'differentFrom' };
    add(groupA, { member: id, counterpart: target, source });
    add(groupB, { member: target, counterpart: id, source });
  }
  return byGroup;
};

/**
 * Twenty-eighth wave: propagates pinned disequalities into an equality
 * group's finite fixed-calendar domain. A `differentFrom` edge to a PINNED
 * counterpart removes exactly one instant from the group's enumerable domain
 * — the one whose member-side stored value (`storedPinKeyAtDay`, judged at
 * the constrained member's own resolution) matches the counterpart's pin key
 * — and the group's fixed interval then tightens to the pruned domain's
 * hull, exactly where `tightenToSurvivingInstantHull` already slots its own
 * tightening. The per-edge feasibility check and the chain propagation both
 * re-read that interval, which is what closes the reviewer's repro: `A`
 * pinned to Jan 1 with `A differentFrom B`, `B` and `C` each spanning
 * Jan 1-3, `B < C`, and `D` pinned to Jan 3 with `C differentFrom D` prunes
 * `B` to [Jan 2, Jan 3] and `C` to [Jan 1, Jan 2], so the strict edge's
 * `max(C) <= min(B)` test finally fires — no pairwise pin comparison ever
 * could, because neither `B` nor `C` is pinned. The hull stays a superset of
 * the group's feasible shared values (the domain is a superset and only
 * provably-unholdable instants are removed), so every infeasibility judged
 * against it is genuine.
 *
 * A domain pruned EMPTY is its own contradiction — the members have no
 * selectable date left — reported here (class `disjointBounds`, whose
 * repair-batching entry already covers reports that depend on unlisted
 * pin provenance) with the edge endpoints as participants and, following the
 * odd-cycle single-edge precedent, a minimal strip: every rule instance
 * excluding ONE deterministically-chosen value (the smallest), whose removal
 * provably restores that value. A single-value domain emptied by a single
 * exclusion is deliberately NOT reported here: the member is then pinned
 * (own window collapse, a group-derived inherited pin, or a propagated
 * collapse), which is `pinnedEqualDifferentFrom`'s territory, and reporting
 * both would double-strip one conflict.
 *
 * Everything uncertain declines to prune (accept):
 *   - non-datetime or unenumerable/over-cap domains, and groups touching a
 *     member the group-level emptiness checks already reported
 *     (`unsatisfiableGroupMemberIds` — the "never judge against an
 *     already-empty group" precedent), or containing a cross-resolution
 *     `sameAs` edge (the mixed-resolution repair separates those members);
 *   - counterparts inside `unsatisfiableGroupMemberIds` (their repair may
 *     rearrange the very grouping their pin travelled);
 *   - counterparts pinned on another origin or resolution — the key-space
 *     comparison makes a mismatch structurally impossible to misapply;
 *   - counterparts with no own, sameAs-inherited, or earlier
 *     disequality-derived pin. Comparator-propagated pins are NOT consulted:
 *     they are the chain pass's own output, and the pruned hulls feed that
 *     pass.
 *
 * When pruning leaves one instant, every member's canonical stored key at
 * that instant becomes another pin source. The caller iterates those pins to
 * a monotone fixpoint and passes the prior round's exact surviving domain
 * back in: a removed interior instant therefore never re-enters through the
 * convex hull published to comparator consumers. A round can only add a
 * previously absent pin and a variable can contribute at most one, so
 * termination is bounded by the number of variables. Enumeration caps and
 * every bailout above are decided when the initial exact domain is built and
 * remain in force throughout.
 */
type DisequalityPruningResult = {
  contradiction: ValidationContradiction | undefined;
  derivedPins: Map<string, string>;
  survivingDomain: Set<number> | undefined;
};

const noDisequalityPruning = (): DisequalityPruningResult => ({
  contradiction: undefined,
  derivedPins: new Map(),
  survivingDomain: undefined,
});

const pruneToPinnedDisequalityHull = (
  variables: UnknownRecord,
  members: string[],
  intervals: GroupIntervals,
  exactDomain: ReadonlySet<number> | undefined,
  disequalities: PinnedDisequalityEdge[] | undefined,
  pinOf: (id: string) => string | number | boolean | undefined,
  unsatisfiableGroupMemberIds: ReadonlySet<string>,
): DisequalityPruningResult => {
  if (!disequalities || disequalities.length === 0) {
    return noDisequalityPruning();
  }
  const types = new Set(members.map((member) => typeOf(variables[member])));
  const [onlyType] = types;
  if (types.size !== 1 || onlyType !== 'datetime') {
    return noDisequalityPruning();
  }
  if (members.some((member) => unsatisfiableGroupMemberIds.has(member))) {
    return noDisequalityPruning();
  }
  if (hasCrossResolutionSameAsEdge(variables, members)) {
    return noDisequalityPruning();
  }
  if (exactDomain === undefined || exactDomain.size === 0) {
    return noDisequalityPruning();
  }

  const exclusions = new Map<
    number,
    { sources: VariableRuleRef[]; counterparts: string[] }
  >();
  for (const edge of disequalities) {
    if (unsatisfiableGroupMemberIds.has(edge.counterpart)) continue;
    const pin = pinOf(edge.counterpart);
    // Datetime pins are always string keys, so any other pin shape (or none)
    // excludes nothing.
    if (typeof pin !== 'string') continue;
    const resolution = dateResolutionOf(variables[edge.member]);
    for (const day of exactDomain) {
      if (storedPinKeyAtDay(day, resolution) !== pin) continue;
      const exclusion = exclusions.get(day) ?? {
        sources: [],
        counterparts: [],
      };
      if (
        !exclusion.sources.some(
          (existing) => stripKey(existing) === stripKey(edge.source),
        )
      ) {
        exclusion.sources.push(edge.source);
      }
      if (!exclusion.counterparts.includes(edge.counterpart)) {
        exclusion.counterparts.push(edge.counterpart);
      }
      exclusions.set(day, exclusion);
      // Stored keys are injective per day at one resolution, so one rule
      // instance removes at most this single instant.
      break;
    }
  }
  if (exclusions.size === 0) return noDisequalityPruning();

  const surviving = [...exactDomain].filter((day) => !exclusions.has(day));
  if (surviving.length > 0) {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const day of surviving) {
      if (day < min) min = day;
      if (day > max) max = day;
    }
    addToGroupIntervals(intervals, { min, max, origin: 'fixed' });
    const derivedPins = new Map<string, string>();
    if (surviving.length === 1) {
      const [onlyDay] = surviving;
      if (onlyDay === undefined) return noDisequalityPruning();
      for (const member of members) {
        const pin = storedPinKeyAtDay(
          onlyDay,
          dateResolutionOf(variables[member]),
        );
        if (pin !== undefined) derivedPins.set(member, pin);
      }
    }
    return {
      contradiction: undefined,
      derivedPins,
      survivingDomain: new Set(surviving),
    };
  }

  // Emptied. A single excluded value means a single-value domain — the
  // pinned-equal machinery's territory (see the doc comment above).
  if (exclusions.size < 2) return noDisequalityPruning();
  const orderedDays = [...exclusions.keys()].toSorted(
    (dayA, dayB) => dayA - dayB,
  );
  const [smallestDay] = orderedDays;
  const chosen =
    smallestDay === undefined ? undefined : exclusions.get(smallestDay);
  const [first, ...rest] = chosen?.sources ?? [];
  if (!first) return noDisequalityPruning();
  const counterparts: string[] = [];
  for (const day of orderedDays) {
    for (const counterpart of exclusions.get(day)?.counterparts ?? []) {
      if (!counterparts.includes(counterpart)) counterparts.push(counterpart);
    }
  }
  const memberNames = members.map(
    (member) => `"${nameOf(member, variables[member])}"`,
  );
  const counterpartNames = counterparts.map(
    (counterpart) => `"${nameOf(counterpart, variables[counterpart])}"`,
  );
  const subject =
    members.length === 1
      ? `Variable ${memberNames[0]}`
      : `Variables ${memberNames.join(', ')}`;
  return {
    contradiction: {
      class: 'disjointBounds',
      message: `${subject}: differentFrom rules against pinned variables ${counterpartNames.join(', ')} leave no selectable date`,
      variableIds: [
        ...members,
        ...counterparts.filter((counterpart) => !members.includes(counterpart)),
      ],
      strips: [first, ...rest],
    },
    derivedPins: new Map(),
    survivingDomain: undefined,
  };
};

const INTERVAL_ORIGINS = [
  'fixed',
  'interviewDate',
] as const satisfies readonly IntervalOrigin[];

/**
 * Variable types whose interval is measured in whole numbers: datetime bounds
 * are UTC day numbers (and, on the symbolic origin, integer day offsets — see
 * `relativeDateWindowInterval`), text bounds are string lengths, categorical
 * bounds are selection counts. `number` is DELIBERATELY absent: its bounds
 * are integers (`z.number().int()` in validation.ts) but the VALUES are not —
 * the interview runtime coerces a number field with a bare `Number()`
 * (`coerceFormValues`), so 1.5 is a legal answer. `scalar` is absent for a
 * different reason: its values ARE quantised, but on the visual analog
 * scale's 0.001 grid rather than the integer one — see
 * `SCALAR_CHAIN_QUANTUM`. Read only by `chainNodeQuantum`.
 */
const INTEGER_QUANTITY_TYPES = new Set(['datetime', 'text', 'categorical']);

/**
 * A provably quantised chain-node value domain: every value the node's
 * variables can hold is a multiple of `step`. `decimals` is `step`'s exact
 * decimal precision, so grid arithmetic can be normalised through `toFixed` —
 * repeated binary-float addition of 0.001 would drift off the grid within a
 * few hops, and both the grid-membership test and the strict-hop step must
 * stay exact for the strict-edge tightening to be sound. The integer grid
 * keeps its `Number.isInteger`/plain-addition fast path, byte-identical to
 * the behaviour it had when `ChainNode` carried a boolean `integral` flag.
 */
type ChainQuantum = { step: number; decimals: number };

const INTEGER_CHAIN_QUANTUM: ChainQuantum = { step: 1, decimals: 0 };

/**
 * Thirty-third wave: the visual analog scale's quantisation.
 * `VisualAnalogScaleField` (fresco-ui) renders base-ui's Slider with
 * `min = 0, max = 1, step = 0.001`, and every path a value can leave the
 * control by is step-aligned: a pointer drag rounds through base-ui's
 * `roundValueToStep` (SliderControl) and clamps to the range, a keyboard move
 * first rounds the current value to the step and then adds ±step/±largeStep
 * with decimal-exact `toFixed` arithmetic (SliderThumb; Home/End emit the
 * endpoints themselves), and the untouched-commit fallback writes the
 * midpoint 0.5. A scalar can therefore only ever store one of the 1001 grid
 * values k/1000 — which is exactly what makes a strict comparator chain of
 * more than 1001 scalars infeasible: consecutive strictly-ordered grid values
 * differ by at least the step. See `intervalOf`'s scalar case for why the
 * control (and with it this grid) is determined for every scalar variable,
 * explicit-component and componentless alike.
 */
const SCALAR_CHAIN_QUANTUM: ChainQuantum = { step: 0.001, decimals: 3 };

const isOnQuantumGrid = (value: number, quantum: ChainQuantum): boolean =>
  quantum.decimals === 0
    ? Number.isInteger(value)
    : Number(value.toFixed(quantum.decimals)) === value;

const stepAlongQuantumGrid = (
  value: number,
  quantum: ChainQuantum,
  direction: 1 | -1,
): number =>
  quantum.decimals === 0
    ? value + direction
    : Number((value + direction * quantum.step).toFixed(quantum.decimals));

/**
 * One end of a propagated range, carried with enough provenance to name the
 * chain that produced it.
 */
type ChainBound = {
  value: number;
  /**
   * The bound is EXCLUSIVE: the node's value has to lie strictly beyond
   * `value`. Produced by a strict comparator step over a quantity that is not
   * provably quantised.
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
  /** The node's provably quantised value grid, when it has one. */
  quantum: ChainQuantum | undefined;
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

type ChainedBoundResult = {
  contradictions: ValidationContradiction[];
  /**
   * Twenty-second-wave Finding 1: every variable a propagated bound pins to
   * one exact value, keyed by variable id, encoded exactly like
   * `pinnedValue`'s own return value (a raw number for `number`,
   * `pinnedValue`'s `datetime:${origin}:${value}` tag for a full-resolution
   * datetime, or — twenty-seventh-wave Finding 2 — its
   * `datetime:${resolution}:${stored}` tag for a coarse picker whose
   * collapse lands exactly on a representable coarse emission) so the two
   * are directly comparable. Consulted only as a FALLBACK by
   * `pinnedEqualDifferentFromContradictions` — a variable's own
   * `pinnedValue` always wins when it applies. Populated below, once per
   * origin, from nodes whose propagated min and max collapse to one CLOSED
   * point.
   */
  propagatedPins: Map<string, string | number>;
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
 * next value to lie strictly beyond it, which is an exact `±step` when the
 * target's domain is a provably quantised grid the bound itself sits on
 * (integer quantities step by 1, scalars by the visual analog scale's 0.001 —
 * see `ChainQuantum`) and an open bound otherwise — the distinction that
 * makes `A >= B >= C` with `A.max = C.min` stay satisfiable while
 * `A > B > C` with the same bounds does not.
 */
const stepChainBound = (
  bound: ChainBound,
  strict: boolean,
  quantum: ChainQuantum | undefined,
  direction: 1 | -1,
  from: number,
): ChainBound => {
  const carried = { root: bound.root, via: from, hops: bound.hops + 1 };
  if (!strict) return { ...carried, value: bound.value, open: bound.open };
  if (quantum !== undefined && isOnQuantumGrid(bound.value, quantum)) {
    return {
      ...carried,
      value: stepAlongQuantumGrid(bound.value, quantum, direction),
      open: false,
    };
  }
  return { ...carried, value: bound.value, open: true };
};

const isIntegerQuantity = (variable: unknown): boolean => {
  const type = typeOf(variable);
  return type !== undefined && INTEGER_QUANTITY_TYPES.has(type);
};

/**
 * The quantised grid a condensation node's values provably live on, if any.
 * A node mixing grids gets none: an equality group can only mix types through
 * raw migration input (`usableReference` joins same-typed variables), and a
 * mixed node's domain is not provably any single grid — `undefined` falls
 * back to the open-bound (accept-direction) strict hop exactly as before.
 */
const chainNodeQuantum = (
  variables: UnknownRecord,
  variableIds: string[],
): ChainQuantum | undefined => {
  if (variableIds.length === 0) return undefined;
  if (variableIds.every((id) => isIntegerQuantity(variables[id]))) {
    return INTEGER_CHAIN_QUANTUM;
  }
  if (variableIds.every((id) => typeOf(variables[id]) === 'scalar')) {
    return SCALAR_CHAIN_QUANTUM;
  }
  return undefined;
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
 * Twenty-second-wave Finding 2: rounds a bound landing on a coarse
 * (month/year) DatePicker node to that picker's nearest ACTUAL emission,
 * reusing the discrete-instant helpers `coarseInstantsOf` and
 * `intersectInstantSets` twenty-first-wave Finding 2 added for equality
 * groups, rather than inventing a second notion of "what a coarse picker can
 * emit". Without this, a bound carried in from a neighbour lands as a raw
 * day number the target can never actually store — `dateWindowInterval`'s
 * convex `[min, max]` is only a SUPERSET of a coarse picker's true
 * emissions (see its own docstring) — so a chain infeasible against the
 * picker's real discrete choices was accepted as though every day in its
 * convex window were selectable.
 *
 * `direction` mirrors the caller's propagation direction: +1 while carrying
 * a MIN bound forward rounds UP to the smallest achievable instant at or
 * beyond the candidate (strictly beyond it when the candidate is open), and
 * -1 while carrying a MAX bound backward rounds DOWN to the largest
 * achievable instant at or before it. Once selected, the instant is itself
 * achievable, so the result is always closed — same reasoning as
 * `pinnedValue`'s coarse branch, which pins a collapsed coarse window
 * outright because exactly one option remains.
 *
 * Falls back to the candidate UNCHANGED — never invents a tighter OR looser
 * bound of its own — whenever exact rounding is not possible: the target is
 * not uniformly one coarse-resolution datetime (a mixed or full-resolution
 * node is left to the existing convex handling), some member's window
 * cannot be safely enumerated (an open bound, or wider than
 * `COARSE_INSTANT_ENUMERATION_CAP`), or no member instant satisfies the
 * direction at all. This is the same fallback discipline
 * `discreteInstantsEmpty` uses: an inexact case is left to the pre-existing
 * (looser but safe) convex reasoning rather than risking a false rejection
 * or an unbounded enumeration.
 */
const roundToCoarseEmission = (
  variables: UnknownRecord,
  targetVariableIds: string[],
  candidate: ChainBound,
  direction: 1 | -1,
): ChainBound => {
  if (
    targetVariableIds.length === 0 ||
    targetVariableIds.some((id) => typeOf(variables[id]) !== 'datetime')
  ) {
    return candidate;
  }
  const resolutions = new Set(
    targetVariableIds.map((id) => dateResolutionOf(variables[id])),
  );
  const [resolution] = resolutions;
  if (resolutions.size !== 1 || resolution === 'full') return candidate;

  let instants: Set<number> | undefined;
  for (const id of targetVariableIds) {
    const coarse = coarseInstantsOf(variables[id]);
    if (coarse === 'unenumerable' || coarse === undefined) return candidate;
    instants =
      instants === undefined ? coarse : intersectInstantSets(instants, coarse);
  }
  if (instants === undefined || instants.size === 0) return candidate;

  const sorted = [...instants].toSorted((a, b) => a - b);
  const rounded =
    direction === 1
      ? sorted.find((value) =>
          candidate.open ? value > candidate.value : value >= candidate.value,
        )
      : sorted
          .toReversed()
          .find((value) =>
            candidate.open ? value < candidate.value : value <= candidate.value,
          );
  if (rounded === undefined) return candidate;
  return { ...candidate, value: rounded, open: false };
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
  tightenedGroupIntervals: ReadonlyMap<string, GroupIntervals>,
): ChainedBoundResult {
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
  if (groupAdjacency.size === 0) {
    return { contradictions: [], propagatedPins: new Map() };
  }

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
    // Twenty-seventh-wave Finding 3 seeds propagation from the node's true
    // reachable range, not its convex approximation; the twenty-eighth wave
    // reuses the caller's per-group tightened intervals outright so the
    // pinned-disequality pruned hull seeds this pass too. Every
    // all-non-strict group cycle was already contracted by
    // `buildEqualityGroups`, so in practice each surviving component IS one
    // equality group; the defensive multi-group path recomputes the merged
    // surviving-instant hull as before (without pruning — accept).
    const [soleGroup] = component;
    const precomputed =
      component.length === 1 && soleGroup !== undefined
        ? tightenedGroupIntervals.get(soleGroup)
        : undefined;
    let intervals: GroupIntervals;
    if (precomputed) {
      intervals = precomputed;
    } else {
      intervals = intervalsOfMembers(variables, variableIds);
      tightenToSurvivingInstantHull(variables, variableIds, intervals);
    }
    const nodeIndex = nodes.length;
    for (const group of component) nodeOf.set(group, nodeIndex);
    nodes.push({
      variableIds,
      intervals,
      quantum: chainNodeQuantum(variables, variableIds),
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
  const propagatedPins = new Map<string, string | number>();

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
        const stepped = stepChainBound(
          bound,
          edge.strict,
          target.quantum,
          1,
          index,
        );
        // Twenty-second-wave Finding 2: a bound landing on a coarse
        // DatePicker's node may not itself be one of that picker's actual
        // emissions — round it to the nearest one it can genuinely reach.
        const candidate = roundToCoarseEmission(
          variables,
          target.variableIds,
          stepped,
          1,
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
        const stepped = stepChainBound(
          bound,
          edge.strict,
          target.quantum,
          -1,
          index,
        );
        const candidate = roundToCoarseEmission(
          variables,
          target.variableIds,
          stepped,
          -1,
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

      // Twenty-second-wave Finding 1: a node whose propagated min and max
      // collapse to one CLOSED point pins every member to that value, even
      // when neither bound is the node's own — `pinnedEqualDifferentFromContradictions`
      // reads this map as a fallback once a variable's own rules don't
      // already pin it. Scoped to `number` and `datetime`: text/categorical
      // bounds are lengths and counts rather than values, and a SCALAR
      // collapse (thirty-third wave) deliberately records nothing — scalar's
      // validation pick carries no `differentFrom`/`sameAs` (variable.ts),
      // and the pinned-equal check is this map's only reader, so a scalar
      // pin could never be consumed; raw migration input carrying such a
      // rule stays accept-direction. A full-resolution datetime
      // records the same origin-tagged day-number key `pinnedValue` derives;
      // a COARSE (month/year) member additionally records its pin
      // (twenty-seventh-wave Finding 2) whenever the collapsed day is
      // exactly one representable coarse emission — encoded through
      // `coarseStoredValueAtDay` into the same canonical stored-string key
      // `pinnedValue`'s coarse branch uses — and only on the 'fixed' origin,
      // the only one a coarse stored string exists on (a coarse pin key is
      // resolution-tagged, never origin-tagged). A collapse landing between
      // coarse instants, on a fractional day, or on a year with no
      // canonical four-digit stored form records nothing (accept).
      // `!min.open && !max.open` is the fractional-domain guard:
      // a strict hop only ever leaves a bound open when its quantity is not
      // provably quantised (`stepChainBound`), so an open collapse
      // means the node's true window excludes its one candidate point (a
      // provably EMPTY domain, always caught elsewhere as an infeasibility)
      // rather than a pinned one.
      if (min.value === max.value && !min.open && !max.open) {
        const node = nodes[index];
        for (const variableId of node?.variableIds ?? []) {
          const type = typeOf(variables[variableId]);
          if (type === 'number') {
            propagatedPins.set(variableId, min.value);
          } else if (type === 'datetime') {
            const resolution = dateResolutionOf(variables[variableId]);
            if (resolution === 'full') {
              propagatedPins.set(variableId, `datetime:${origin}:${min.value}`);
            } else if (origin === 'fixed') {
              const stored = coarseStoredValueAtDay(min.value, resolution);
              if (stored !== undefined) {
                propagatedPins.set(
                  variableId,
                  `datetime:${resolution}:${stored}`,
                );
              }
            }
          }
        }
      }

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

  return { contradictions: found, propagatedPins };
}

type DisjointBoundsResult = ChainedBoundResult & {
  /**
   * Twenty-fourth-wave Finding 1: every member of an equality group one of
   * the GROUP-LEVEL emptiness checks below reported. Such a report's repair
   * (`groupEqualityStrips`) may strip the group's `sameAs` edges, so
   * `sameAsInheritedPins` must never carry a pin across them — per-edge and
   * chain reports are deliberately NOT recorded here, since their repairs
   * only ever strip comparator rules, which a `sameAs`-forced pin survives.
   */
  unsatisfiableGroupMemberIds: Set<string>;
  /**
   * Thirty-first wave: each variable's equality group's tightened intervals
   * — the exact per-group maps the per-edge and chain checks judge against
   * (post-`tightenToSurvivingInstantHull`,
   * post-`pruneToPinnedDisequalityHull`), keyed by MEMBER id so the parity
   * pass can look them up from its own equality-group construction without
   * coupling to this pass's group-root labels. Every member of one group
   * shares one `GroupIntervals` reference.
   */
  groupIntervalsByMember: Map<string, GroupIntervals>;
  /**
   * Thirty-first wave: every member of an equality group whose enumerable
   * fixed domain `pruneToPinnedDisequalityHull` emptied outright (the
   * multi-exclusion report). The datetime parity check bails any component
   * touching one of these — the emptiness report's strip may remove the very
   * `differentFrom` edges the parity graph is built from, and a second
   * report would double-strip one conflict.
   */
  disequalityEmptiedMemberIds: Set<string>;
};

function disjointBoundsContradictions(
  variables: UnknownRecord,
  stageEffectiveComponents: boolean,
): DisjointBoundsResult {
  const found: ValidationContradiction[] = [];
  const unsatisfiableGroupMemberIds = new Set<string>();
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
    subset.length > 1 &&
    sharedBooleanDomain(variables, subset, stageEffectiveComponents)?.size ===
      0;

  // Group-level emptiness checks first. Their verdicts
  // (`unsatisfiableGroupMemberIds`) must be complete before the second pass
  // below derives pin sources and tightened intervals from them.
  for (const [group, members] of membersOf) {
    const internalNonStrictEdges =
      internalNonStrictEdgesByGroup.get(group) ?? [];

    const report = (
      clause: string,
      isEmptyFor: (subset: string[]) => boolean,
    ): void => {
      // Recorded before the strip computation: even a conflict the policy
      // cannot repair must keep pin inheritance away from this group.
      for (const member of members) unsatisfiableGroupMemberIds.add(member);
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

  // Twenty-eighth wave: pin sources for the disequality pruning below —
  // computed only once the group-level verdicts above are final, so a pin is
  // never inherited across a sameAs edge an emptiness repair may strip.
  // (`pinnedEqualDifferentFromContradictions` later derives the identical map
  // from the same inputs: nothing after this point adds to
  // `unsatisfiableGroupMemberIds`.) Propagated pins are deliberately absent —
  // see `pruneToPinnedDisequalityHull`.
  const { find: sameAsFind } = sameAsOnlyUnionFind(variables);
  const inheritedPins = sameAsInheritedPins(
    variables,
    sameAsFind,
    unsatisfiableGroupMemberIds,
    stageEffectiveComponents,
  );
  const comparatorMergedPins = comparatorMergedGroupInheritedPins(
    variables,
    membersOf,
    unsatisfiableGroupMemberIds,
    stageEffectiveComponents,
  );
  const disequalityDerivedPins = new Map<string, string>();
  const disequalitiesByGroup = datetimeDisequalitiesByGroup(
    variables,
    groupOf,
    graph.dependencies,
  );

  // Twenty-seventh-wave Finding 3 / twenty-eighth wave: the per-edge
  // feasibility check below (and, through `chainedBoundContradictions`, the
  // chain propagation) judges each comparator against the group's TRUE
  // reachable range — its surviving-instant hull, further pruned by pinned
  // disequalities. The group-level emptiness checks above recompute their own
  // untightened intervals and are unaffected. A domain the pruning empties
  // outright is reported here instead of tightening.
  const groupIntervals = new Map<string, GroupIntervals>();
  const exactDomainsByGroup = new Map<string, Set<number>>();
  const groupIntervalsByMember = new Map<string, GroupIntervals>();
  const disequalityEmptiedMemberIds = new Set<string>();
  for (const [group, members] of membersOf) {
    const intervals = intervalsOfMembers(variables, members);
    tightenToSurvivingInstantHull(variables, members, intervals);
    groupIntervals.set(group, intervals);
    const exactDomain = enumerableFixedDomain(
      variables,
      members,
      intervals.get('fixed'),
    );
    if (exactDomain !== undefined) {
      exactDomainsByGroup.set(group, exactDomain);
    }
    for (const member of members) groupIntervalsByMember.set(member, intervals);
  }

  // Each round filters the previous exact finite domain rather than
  // re-enumerating its convex hull. That makes interior exclusions monotone:
  // once an instant is removed it cannot re-enter merely because the hull's
  // endpoints still surround it. A productive round adds a singleton pin; at
  // most one is recorded per variable, so the fixpoint takes no more than N
  // productive rounds. Groups whose domain was already reported empty are
  // skipped thereafter so their poisoned state never supplies a pin.
  let addedPin: boolean;
  do {
    addedPin = false;
    const roundDerivedPins = new Map(disequalityDerivedPins);
    const pendingPins = new Map<string, string>();
    const pinOf = (id: string): string | number | boolean | undefined =>
      pinnedValue(variables[id], stageEffectiveComponents) ??
      inheritedPins.get(id) ??
      comparatorMergedPins.get(id) ??
      roundDerivedPins.get(id);
    for (const [group, members] of membersOf) {
      if (members.some((member) => disequalityEmptiedMemberIds.has(member))) {
        continue;
      }
      const intervals = groupIntervals.get(group);
      if (intervals === undefined) continue;
      const pruning = pruneToPinnedDisequalityHull(
        variables,
        members,
        intervals,
        exactDomainsByGroup.get(group),
        disequalitiesByGroup.get(group),
        pinOf,
        unsatisfiableGroupMemberIds,
      );
      if (pruning.contradiction) {
        // A contradiction that only appears after consuming another group's
        // disequality-derived pin belongs to the downstream pinned/parity
        // machinery. Reporting it here would reclassify an established
        // conflict and poison the very group whose singleton proof that
        // downstream pass needs. The interval was not mutated on emptiness,
        // so declining here is a true bailout.
        const dependsOnDerivedPin = pruning.contradiction.variableIds.some(
          (variableId) =>
            !members.includes(variableId) && roundDerivedPins.has(variableId),
        );
        if (dependsOnDerivedPin) continue;
        found.push(pruning.contradiction);
        for (const member of members) {
          disequalityEmptiedMemberIds.add(member);
          disequalityDerivedPins.delete(member);
        }
        continue;
      }
      if (pruning.survivingDomain !== undefined) {
        exactDomainsByGroup.set(group, pruning.survivingDomain);
      }
      for (const [member, pin] of pruning.derivedPins) {
        const existing = roundDerivedPins.get(member);
        if (existing === undefined) {
          pendingPins.set(member, pin);
        }
      }
    }
    for (const [member, pin] of pendingPins) {
      if (!disequalityDerivedPins.has(member)) {
        disequalityDerivedPins.set(member, pin);
        addedPin = true;
      }
    }
  } while (addedPin);

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

  const chained = chainedBoundContradictions(variables, graph, groupIntervals);
  found.push(...chained.contradictions);
  for (const [member, pin] of disequalityDerivedPins) {
    if (!chained.propagatedPins.has(member)) {
      chained.propagatedPins.set(member, pin);
    }
  }

  return {
    contradictions: found,
    propagatedPins: chained.propagatedPins,
    unsatisfiableGroupMemberIds,
    groupIntervalsByMember,
    disequalityEmptiedMemberIds,
  };
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
      .map((edge): VariableRuleRef => ({
        variableId: edge.source,
        rule: 'sameAs',
      }));
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
 * The BFS-tree path between two nodes of the SAME connected component, via
 * their lowest common ancestor. Both `pathToRoot` calls necessarily
 * terminate at the same root (one BFS per component), so the first node from
 * `a`'s path that also appears in `b`'s path is their LCA. Twenty-third-wave
 * Finding 2 extracted this from the odd-cycle reconstruction below so the
 * domain-aware parity check further down can reuse it to connect two
 * disagreeing pinned nodes that need not be directly adjacent.
 */
const pathBetween = (
  parent: Map<string, string>,
  a: string,
  b: string,
): string[] => {
  const pathFromA = pathToRoot(parent, a);
  const pathFromB = pathToRoot(parent, b);
  const bAncestors = new Set(pathFromB);
  const lcaIndex = pathFromA.findIndex((candidate) =>
    bAncestors.has(candidate),
  );
  const lca = pathFromA[lcaIndex];
  if (lca === undefined) return [];
  const sideFromA = pathFromA.slice(0, lcaIndex + 1); // a..lca
  const lcaIndexInB = pathFromB.indexOf(lca);
  const sideFromB = pathFromB.slice(0, lcaIndexInB).toReversed(); // (lca's child)..b
  return [...sideFromA, ...sideFromB];
};

const booleanDifferentFromEdgeKey = (edge: BooleanDifferentFromEdge): string =>
  `${edge.groupA}${KEY_SEPARATOR}${edge.groupB}`;

/**
 * The `differentFrom` edges between consecutive groups along a walk over the
 * canonical `edgesByKey` buckets built below. `closeLoop` wraps the last
 * group back to the first, matching the cycle shape the odd-cycle
 * reconstruction needs; without it, the walk is the simple (non-wrapping)
 * path the domain-aware parity check (Finding 2) connects two disagreeing
 * pinned nodes with.
 */
const edgesAlongWalk = (
  edgesByKey: Map<string, BooleanDifferentFromEdge>,
  groups: string[],
  closeLoop: boolean,
): BooleanDifferentFromEdge[] => {
  const edges: BooleanDifferentFromEdge[] = [];
  const hops = closeLoop ? groups.length : groups.length - 1;
  for (let index = 0; index < hops; index++) {
    const a = groups[index];
    const b = groups[(index + 1) % groups.length];
    if (a === undefined || b === undefined) continue;
    const [lower, upper] = [a, b].toSorted();
    const edge = edgesByKey.get(`${lower}${KEY_SEPARATOR}${upper}`);
    if (edge) edges.push(edge);
  }
  return edges;
};

/**
 * Twenty-third-wave Finding 1: the single edge a minimal-strip repair
 * removes from a candidate walk — the odd cycle itself, or (Finding 2 below)
 * the path connecting two disagreeing pinned nodes. Removing any ONE edge
 * from an odd cycle makes the remainder bipartite, and removing any ONE edge
 * from a connecting path disconnects the two nodes it forced into a
 * relationship — either walk only ever needs a single edge stripped, never
 * all of them. `edgesAlongWalk` already returns each DISTINCT edge once
 * (`edgesByKey` bucketed every declaration of a given group pair together
 * when the graph was built — see `oddDifferentFromCycleContradictions`
 * below), so the edge chosen here is picked by its own canonical (sorted
 * `groupA`/`groupB`) key for a stable, run-independent result — the same
 * sorted-key convention `findStrictCycles`'s cycle-dedup key above already
 * uses. `edge.sources` already collects EVERY declaration of that specific
 * edge (both endpoints may declare it, and a group with more than one member
 * can supply more than one), so stripping the chosen edge's sources removes
 * every duplicate of it too.
 *
 * Deliberately NOT extended to `strictComparatorCycle` (`findStrictCycles`
 * above), which keeps stripping every edge of ITS cycle unchanged by this
 * wave. That policy is a separate, established choice this fix does not
 * revisit; see the accompanying report for the analysis of whether it
 * should also move to a single-edge repair.
 */
const smallestKeyedEdge = (
  edges: BooleanDifferentFromEdge[],
): BooleanDifferentFromEdge | undefined =>
  edges.toSorted((edgeA, edgeB) => {
    const keyA = booleanDifferentFromEdgeKey(edgeA);
    const keyB = booleanDifferentFromEdgeKey(edgeB);
    return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
  })[0];

// Twenty-third-wave Finding 2: a group pinned to a single boolean value
// (`sharedBooleanDomain` collapses to size 1), tagged with its BFS colour so
// the domain-aware parity check below can compare the two.
type SingletonPin = { group: string; value: boolean; color: 0 | 1 };

const byPinGroup = (a: SingletonPin, b: SingletonPin): number =>
  a.group < b.group ? -1 : a.group > b.group ? 1 : 0;

/**
 * Whether a pin is consistent with the reference assignment "colour 0 =
 * true" — i.e. whether its colour and required value agree. A component's
 * two-colouring admits exactly two globally-consistent assignments (this
 * one, or its mirror image "colour 0 = false"); the component is
 * satisfiable only if every pin agrees with ONE of them, so every pin must
 * either all match this reference or all mismatch it (the mirrored
 * assignment) — never a mix of both.
 */
const matchesReferenceAssignment = (pin: SingletonPin): boolean =>
  pin.value === (pin.color === 0);

/**
 * Thirtieth wave (Fix 3): the shared two-value option domain of an ordinal
 * `differentFrom` component, with every group's singleton pin BOOLEAN-IZED
 * against it, or `undefined` whenever the component is not uniformly
 * two-valued (accept). The general k-colourability limitation the parity
 * machinery documents does not apply when every effective domain in the
 * component is exactly the same two-value set: the component is then
 * satisfiable iff it is two-colourable, which is precisely what the
 * existing linear boolean bipartite check decides — so an ordinal component
 * qualifying here is fed through that machinery verbatim, its two domain
 * values standing in for true/false.
 *
 * The mapping is deterministic: the domain pair is sorted by its typeof-
 * tagged JSON token (the same tagging `pinnedValue`'s categorical keys use)
 * and the FIRST value is the reference — a singleton pin becomes the
 * boolean "is the reference value", so `SingletonPin` and
 * `matchesReferenceAssignment` are reused rather than duplicated, exactly
 * as boolean pins interact with parity.
 *
 * Thirty-second wave (Fix 2): domains are judged at GROUP granularity — each
 * equality group's option-value INTERSECTION (`sharedOptionValues`, the same
 * group-level read the emptiness checks and `sameAsGroupDerivedPin`'s
 * ordinal arm already make), not each member's raw option set. A `sameAs`
 * group can only ever store a value EVERY member offers, so a group joining
 * a three-valued member to a two-valued partner has an effective two-value
 * domain — the wave-30 per-member read bailed on the wider member and
 * accepted an odd cycle over three such groups. A group intersection of
 * size 1 is likewise the GROUP's pin, however many values its widest member
 * would offer alone. Every uncertainty bails the WHOLE component to accept:
 *
 *   - a group touching `unsatisfiableGroupMemberIds` — an empty option
 *     intersection (`optionsDisjoint`, which is also where two disagreeing
 *     singleton members inside one group land) is the emptiness machinery's
 *     own report, whose repair may strip the very grouping edges in play;
 *   - a member with no usable `options` array, or a group intersection that
 *     is empty (defensive alongside the poisoned-group guard) or holds more
 *     than two distinct values (the k-colourability limit stands there);
 *   - two-value group domains that differ between groups ({1,2} beside
 *     {2,3});
 *   - a singleton value outside the shared pair (its differentFrom edges
 *     are trivially satisfiable, so treating it as a pin would be wrong);
 *   - no two-valued group at all: all-singleton components are either the
 *     pinned-equal machinery's (equal pins, already claimed) or trivially
 *     satisfiable, and there is no shared domain to force a colouring
 *     against.
 *
 * Categorical variables do not share this model's per-VALUE reading: the
 * runtime stores a categorical value as an ARRAY and `differentFrom`
 * compares those arrays as order-insensitive multisets (fresco-ui's
 * `isMatchingValue` — the same reading `pinnedValue`'s composite set keys
 * encode), so an unconstrained two-option categorical has four possible
 * stored selections, never a comparable two-value scalar domain. The
 * thirty-second wave (Fix 1) instead admits a categorical component at
 * SELECTION granularity — see `categoricalComponentTwoValueDomain` below —
 * exactly when every group's effective selection domain is the same two
 * multiset selections.
 */
type ComponentTwoValueDomain = {
  /** Group id → whether the group's pinned value is the reference value. */
  pins: Map<string, boolean>;
};

const ordinalDomainToken = (value: string | number): string =>
  JSON.stringify([typeof value, String(value)]);

const ordinalComponentTwoValueDomain = (
  variables: UnknownRecord,
  groups: string[],
  membersOf: Map<string, string[]>,
  unsatisfiableGroupMemberIds: ReadonlySet<string>,
): ComponentTwoValueDomain | undefined => {
  let reference: string | number | undefined;
  let other: string | number | undefined;
  const groupValues = new Map<string, Set<string | number>>();
  for (const group of groups) {
    const members = membersOf.get(group) ?? [group];
    if (members.some((member) => unsatisfiableGroupMemberIds.has(member))) {
      return undefined;
    }
    const shared = sharedOptionValues(variables, members);
    if (
      shared?.type !== 'ordinal' ||
      shared.values.size === 0 ||
      shared.values.size > 2
    ) {
      return undefined;
    }
    groupValues.set(group, shared.values);
    if (shared.values.size !== 2) continue;
    const [first, second] = [...shared.values].toSorted((a, b) => {
      const tokenA = ordinalDomainToken(a);
      const tokenB = ordinalDomainToken(b);
      return tokenA < tokenB ? -1 : tokenA > tokenB ? 1 : 0;
    });
    if (first === undefined || second === undefined) return undefined;
    if (reference === undefined) {
      reference = first;
      other = second;
    } else if (reference !== first || other !== second) {
      return undefined;
    }
  }
  if (reference === undefined || other === undefined) return undefined;
  const pins = new Map<string, boolean>();
  for (const group of groups) {
    const values = groupValues.get(group);
    if (values?.size !== 1) continue;
    const [value] = values;
    if (value === undefined || (value !== reference && value !== other)) {
      return undefined;
    }
    pins.set(group, value === reference);
  }
  return { pins };
};

/**
 * Thirty-second wave (Fix 1): the largest categorical selection domain the
 * parity admission below will derive exactly. Only a domain of at most TWO
 * selections can ever qualify (a shared two-selection pair, or a singleton
 * pin), so the cap exists purely to bound the arithmetic and the enumeration
 * on the way to that answer — a handful comfortably covers every qualifying
 * shape while keeping the worst case a small, constant amount of work per
 * equality group, the same discipline `COARSE_INSTANT_ENUMERATION_CAP`
 * applies to coarse date windows.
 */
const CATEGORICAL_SELECTION_ENUMERATION_CAP = 4;

/**
 * How many distinct selections a categorical effective domain admits — the
 * number of subsets of `optionCount` distinct values whose size lies within
 * `[lo, hi]` — computed arithmetically with an early exit past `cap`
 * (returning `cap + 1`), so a wide cardinality window over many options is
 * never enumerated combinatorially. Each binomial is built through its
 * symmetric form (`k' = min(k, n - k)`), whose intermediate factors are
 * themselves monotonically increasing binomial coefficients, so the early
 * exit can never abandon a term that would have come back under the cap.
 */
const selectionCountWithinWindow = (
  optionCount: number,
  lo: number,
  hi: number,
  cap: number,
): number => {
  let total = 0;
  for (let size = lo; size <= hi; size++) {
    const symmetric = Math.min(size, optionCount - size);
    let binomial = 1;
    for (let factor = 0; factor < symmetric; factor++) {
      binomial = (binomial * (optionCount - factor)) / (factor + 1);
      if (binomial > cap) return cap + 1;
    }
    total += binomial;
    if (total > cap) return cap + 1;
  }
  return total;
};

/**
 * Every selection of a size within `[lo, hi]` over `values`, each encoded as
 * its canonical `categoricalSetPinKey` (order-insensitive and typeof-tagged,
 * so two selections holding the same values always share one key — the
 * multiset reading `isMatchingValue` applies to stored categorical arrays).
 * Only ever called once `selectionCountWithinWindow` has vouched the count
 * is trivially small, so the lexicographic index walk below is bounded by
 * that same cap; it is iterative (no recursion), matching the file's
 * import-time stack discipline (eleventh-wave Finding 2).
 */
const enumerateSelectionKeys = (
  values: (string | number)[],
  lo: number,
  hi: number,
): string[] => {
  const keys: string[] = [];
  for (let size = lo; size <= hi; size++) {
    if (size < 1 || size > values.length) continue;
    const indices: number[] = [];
    for (let index = 0; index < size; index++) indices.push(index);
    for (;;) {
      const selection = new Set<string | number>();
      for (const index of indices) {
        const value = values[index];
        if (value !== undefined) selection.add(value);
      }
      keys.push(categoricalSetPinKey(selection));
      // Advance to the successor combination in lexicographic index order:
      // bump the rightmost index that still has headroom, then re-pack every
      // index after it consecutively.
      let cursor = size - 1;
      while (cursor >= 0) {
        const current = indices[cursor];
        if (
          current !== undefined &&
          current < values.length - (size - cursor)
        ) {
          break;
        }
        cursor -= 1;
      }
      if (cursor < 0) break;
      const bumped = (indices[cursor] ?? 0) + 1;
      for (let index = cursor; index < size; index++) {
        indices[index] = bumped + (index - cursor);
      }
    }
  }
  return keys;
};

/**
 * Thirty-second wave (Fix 1): one equality group's EFFECTIVE categorical
 * selection domain — every selection its members can all store, each as its
 * canonical `categoricalSetPinKey` — or `undefined` when the domain cannot
 * be derived exactly (accept). The group's shared value must be a subset of
 * the members' INTERSECTED distinct option values (`sharedOptionValues`, the
 * same group-level read the emptiness checks and `sameAsGroupDerivedPin`'s
 * categorical arm already use) whose size lies inside the members' MERGED
 * minSelected/maxSelected window (the fixed-origin categorical interval,
 * intersected across members exactly as `optionShortfall` reads it).
 * Selections are non-empty — the entered-value convention `pinnedValue`'s
 * categorical arm documents (`required` owns emptiness) — and the domain is
 * enumerated only once `selectionCountWithinWindow` proves it trivially
 * small; anything wider bails to accept rather than enumerating
 * combinatorially. A non-integral window edge (raw migration input) and an
 * empty merged interval (the group-emptiness machinery's own report) bail
 * the same way.
 */
const categoricalGroupSelectionDomain = (
  variables: UnknownRecord,
  members: string[],
): string[] | undefined => {
  const shared = sharedOptionValues(variables, members);
  if (shared?.type !== 'categorical' || shared.values.size === 0) {
    return undefined;
  }
  const intervals = intervalsOfMembers(variables, members);
  if (hasEmptyOrigin(intervals)) return undefined;
  const window = intervals.get('fixed');
  const lo = Math.max(1, window?.min ?? 1);
  const hi = Math.min(shared.values.size, window?.max ?? shared.values.size);
  if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo > hi) {
    return undefined;
  }
  const count = selectionCountWithinWindow(
    shared.values.size,
    lo,
    hi,
    CATEGORICAL_SELECTION_ENUMERATION_CAP,
  );
  if (count > CATEGORICAL_SELECTION_ENUMERATION_CAP) return undefined;
  return enumerateSelectionKeys([...shared.values], lo, hi);
};

/**
 * Thirty-second wave (Fix 1): the categorical refinement of the thirtieth
 * wave's parity exclusion. That wave kept categorical out on the proof "a
 * two-option categorical has four stored selections" — true of an
 * UNCONSTRAINED two-option variable, but the effective SELECTION domain is
 * what `differentFrom` actually ranges over, and a merged
 * `minSelected: 1`/`maxSelected: 1` window over two shared options leaves
 * exactly TWO storable selections ([x] or [y]), so a three-variable
 * `differentFrom` triangle over them is exactly as unsatisfiable as the
 * boolean one. A component every one of whose groups admits the SAME two
 * selections is satisfiable iff it is two-colourable — the question the
 * boolean bipartite machinery already decides — with selections compared as
 * order-insensitive multisets exactly as the runtime compares stored arrays
 * (fresco-ui's `isMatchingValue`; the canonical `categoricalSetPinKey`
 * encoding, never re-derived, so option ORDER differences between members
 * never split one selection into two). Domains are read at GROUP granularity
 * — each equality group's intersected option set under its merged
 * cardinality window (Fix 2's principle; see
 * `categoricalGroupSelectionDomain`) — and a singleton effective domain pins
 * its group exactly as the boolean/ordinal/datetime singletons do. Every
 * uncertainty bails the WHOLE component to accept:
 *
 *   - a group touching `unsatisfiableGroupMemberIds` — an empty option
 *     intersection (`optionsDisjoint`), an inverted merged cardinality
 *     window (`intervalsEmpty`), or a shortfall (`optionsBelowMinSelected`)
 *     are all the emptiness machinery's own reports, whose repairs may strip
 *     the very grouping edges in play (two disagreeing singleton members
 *     inside one group land here too, as an empty intersection);
 *   - a domain that cannot be derived or enumerated exactly
 *     (`categoricalGroupSelectionDomain`'s own bails, the enumeration cap
 *     included), or that admits more than two selections;
 *   - two-selection domains that differ between groups;
 *   - a singleton selection outside the shared pair (its differentFrom edges
 *     are trivially satisfiable, so treating it as a pin would be wrong);
 *   - no two-selection group at all: all-singleton components are either the
 *     pinned-equal machinery's (equal pins, already claimed) or trivially
 *     satisfiable, and there is no shared domain to force a colouring
 *     against.
 */
const categoricalComponentTwoValueDomain = (
  variables: UnknownRecord,
  groups: string[],
  membersOf: Map<string, string[]>,
  unsatisfiableGroupMemberIds: ReadonlySet<string>,
): ComponentTwoValueDomain | undefined => {
  let reference: string | undefined;
  let other: string | undefined;
  const groupDomains = new Map<string, string[]>();
  for (const group of groups) {
    const members = membersOf.get(group) ?? [group];
    if (members.some((member) => unsatisfiableGroupMemberIds.has(member))) {
      return undefined;
    }
    const domain = categoricalGroupSelectionDomain(variables, members);
    if (domain === undefined || domain.length === 0 || domain.length > 2) {
      return undefined;
    }
    groupDomains.set(group, domain);
    if (domain.length !== 2) continue;
    const [first, second] = domain.toSorted();
    if (first === undefined || second === undefined) return undefined;
    if (reference === undefined) {
      reference = first;
      other = second;
    } else if (reference !== first || other !== second) {
      return undefined;
    }
  }
  if (reference === undefined || other === undefined) return undefined;
  const pins = new Map<string, boolean>();
  for (const group of groups) {
    const domain = groupDomains.get(group);
    if (domain?.length !== 1) continue;
    const [key] = domain;
    if (key === undefined || (key !== reference && key !== other)) {
      return undefined;
    }
    pins.set(group, key === reference);
  }
  return { pins };
};

/**
 * Thirty-first wave: the datetime analogue of
 * `ordinalComponentTwoValueDomain` above — the shared two-instant domain of
 * a datetime `differentFrom` component, with every group's singleton pin
 * BOOLEAN-IZED against it, or `undefined` whenever the component is not
 * uniformly two-instant (accept). Three required full-resolution pickers
 * each windowed to exactly `2020-01-01`–`2020-01-02` in an odd
 * `differentFrom` triangle demand three pairwise-different stored values
 * from two enumerable instants, which is exactly the two-colourability
 * question the boolean bipartite machinery already decides.
 *
 * Domain enumeration reuses the twenty-eighth wave's exact seam
 * (`enumerableFixedDomain`: coarse emission sets via `coarseInstantsOf`,
 * integer-day enumeration otherwise, `COARSE_INSTANT_ENUMERATION_CAP`
 * included) against the group's TIGHTENED fixed interval — the same
 * post-`tightenToSurvivingInstantHull`, post-`pruneToPinnedDisequalityHull`
 * interval every downstream feasibility consumer reads, so synthesized
 * bounds, default floors, group-derived pins, and pruned pinned
 * disequalities have all already been applied. That interval is ALREADY the
 * equality-group intersection Fix 2 requires of the ordinal and categorical
 * qualifications: `intervalsOfMembers` intersects every member's own window
 * into the group interval, and `enumerableFixedDomain` intersects every
 * coarse member's emission set across the group, so a group joining a
 * three-instant member to a two-instant partner qualifies on the shared two
 * instants with no raw per-member domain read anywhere in this path. That makes the pruning
 * ordering the file's established one, not a second convention: a domain
 * whose ENDPOINT the pruning removed re-enumerates two-valued here (its
 * tightened hull moved), while an interior exclusion is invisible to the
 * hull and leaves the modelled domain a SUPERSET — the safe direction, since
 * a superset can only widen a group past two values (bail, accept) or hide a
 * pin (fewer parity conflicts, accept), never invent one.
 *
 * "Same two-value set" is judged in STORED-value space at the members' own
 * resolution: the component must be uniformly ONE resolution (a mixed
 * component bails — cross-resolution stored strings never compare equal
 * under `isMatchingValue`, and cross-resolution equality is the
 * mixed-resolution machinery's territory, so no cross-resolution set can
 * ever qualify as "the same"), and every enumerated instant must have a
 * canonical stored encoding at that resolution (`storedPinKeyAtDay`). Under
 * one shared resolution the day-number sets and the stored-string sets are
 * in bijection, so a uniformly coarse component (say, two year pickers
 * spanning exactly 2020–2021) participates exactly as a full-resolution one
 * does — its stored-string pair {'2020', '2021'} is compared through the
 * same period-start day numbers `coarseInstantsOf` emits.
 *
 * Beyond `ordinalComponentTwoValueDomain`'s bail conditions (unenumerable
 * or over-two-instant domains, differing pairs, out-of-set singletons, no
 * two-instant member), every uncertainty specific to datetime also bails
 * the WHOLE component to accept:
 *
 *   - any member of a group one of the group-level emptiness checks already
 *     reported (`unsatisfiableGroupMemberIds`) — the "never judge against an
 *     already-empty group" precedent;
 *   - any member of a group whose domain `pruneToPinnedDisequalityHull`
 *     emptied outright (`disequalityEmptiedMemberIds`) — that conflict is
 *     the pruning pass's own report, whose strip may remove the very
 *     `differentFrom` edges in play here, and reporting both would
 *     double-strip one conflict;
 *   - an interview-date-origin or windowless member, which
 *     `enumerableFixedDomain` already refuses to place on the fixed
 *     calendar (fixed-origin instants are the only enumerable ones).
 *
 * Thirty-fourth wave (Fix 3): the chain pass's `propagatedPins` NARROW each
 * group's enumerated domain before the two-instant judgement. The
 * reviewer's repro: three full pickers each windowed to Jan 2–3, with
 * `B differentFrom A`, `C differentFrom A`, and `C greaterThanVariable B` —
 * propagation collapses B to Jan 2 and C to Jan 3 (singletons
 * `chainedBoundContradictions` already records), so A must differ from
 * BOTH values of its two-value domain, yet this pass received only the
 * pre-propagation intervals and saw no pin anywhere. A propagated
 * singleton constrains its group exactly as an own or inherited singleton
 * does (it is the group's whole reachable domain under the comparator
 * closure), and the pin keys are origin- and resolution-encoded by the
 * chain pass itself, so key equality against `storedPinKeyAtDay` is the
 * same resolution-honest comparison the disequality pruning uses; a pin
 * whose key matches no enumerated day (another origin, or a collapse the
 * enumerated window cannot see) bails the whole component to accept.
 *
 * ORDERING: `pruneToPinnedDisequalityHull` deliberately refuses to consult
 * propagated pins — its pruned hulls FEED the chain pass, so reading the
 * pass's own output there would demand a second analyser iteration (no
 * fixpoint, by design). This consumer sits on the other side of that
 * boundary: the parity pass runs strictly AFTER the chain pass, reads
 * `propagatedPins` read-only, and emits only contradiction reports that
 * feed nothing back into any interval — the same downstream position from
 * which `pinnedEqualDifferentFromContradictions` already consumes the
 * identical map — so no cycle is introduced and the pruning pass's
 * discipline is untouched.
 */
const datetimeComponentTwoInstantDomain = (
  variables: UnknownRecord,
  groups: string[],
  membersOf: Map<string, string[]>,
  groupIntervalsByMember: ReadonlyMap<string, GroupIntervals>,
  unsatisfiableGroupMemberIds: ReadonlySet<string>,
  disequalityEmptiedMemberIds: ReadonlySet<string>,
  propagatedPins: ReadonlyMap<string, string | number>,
): ComponentTwoValueDomain | undefined => {
  let resolution: DateResolution | undefined;
  for (const group of groups) {
    for (const member of membersOf.get(group) ?? [group]) {
      if (
        unsatisfiableGroupMemberIds.has(member) ||
        disequalityEmptiedMemberIds.has(member)
      ) {
        return undefined;
      }
      const memberResolution = dateResolutionOf(variables[member]);
      resolution ??= memberResolution;
      if (memberResolution !== resolution) return undefined;
    }
  }
  if (resolution === undefined) return undefined;

  let reference: number | undefined;
  let other: number | undefined;
  const groupDomains = new Map<string, Set<number>>();
  for (const group of groups) {
    const members = membersOf.get(group) ?? [group];
    const [anyMember] = members;
    const intervals =
      anyMember === undefined
        ? undefined
        : groupIntervalsByMember.get(anyMember);
    const domain = enumerableFixedDomain(
      variables,
      members,
      intervals?.get('fixed'),
    );
    if (domain === undefined || domain.size === 0 || domain.size > 2) {
      return undefined;
    }
    for (const day of domain) {
      if (storedPinKeyAtDay(day, resolution) === undefined) return undefined;
    }
    // Thirty-fourth wave (Fix 3): a comparator-forced singleton recorded by
    // the chain pass narrows this group's domain exactly as an own bound
    // would — see the ORDERING note in the doc comment above. A pin whose
    // key matches no enumerated day bails the component (accept).
    let narrowed = domain;
    for (const member of members) {
      const pin = propagatedPins.get(member);
      if (pin === undefined) continue;
      const matching = new Set(
        [...narrowed].filter(
          (day) => storedPinKeyAtDay(day, resolution) === pin,
        ),
      );
      if (matching.size === 0) return undefined;
      narrowed = matching;
    }
    groupDomains.set(group, narrowed);
    if (narrowed.size !== 2) continue;
    const [first, second] = [...narrowed].toSorted((dayA, dayB) => dayA - dayB);
    if (first === undefined || second === undefined) return undefined;
    if (reference === undefined) {
      reference = first;
      other = second;
    } else if (reference !== first || other !== second) {
      return undefined;
    }
  }
  if (reference === undefined || other === undefined) return undefined;
  const pins = new Map<string, boolean>();
  for (const group of groups) {
    const domain = groupDomains.get(group);
    if (domain?.size !== 1) continue;
    const [day] = domain;
    if (day === undefined || (day !== reference && day !== other)) {
      return undefined;
    }
    pins.set(group, day === reference);
  }
  return { pins };
};

/**
 * Contradictions in the boolean, two-valued-ordinal, two-instant-datetime,
 * and two-selection-categorical `differentFrom` graph, at equality-group
 * granularity (a `sameAs` group
 * holds one shared value, so `differentFrom` edges connect groups, not
 * individual variables). Two independent structural sources are checked per
 * connected component of that graph:
 *
 *   - An ODD CYCLE (not 2-colourable) is provably unsatisfiable regardless
 *     of which value is chosen: `A ≠ B`, `B ≠ C`, `C ≠ A` forces three
 *     pairwise-distinct values out of a two-value domain.
 *   - Twenty-third-wave Finding 2: even a bipartite (cycle-free) component
 *     can be unsatisfiable when two or more of its members are individually
 *     PINNED to a single boolean value (see `sharedBooleanDomain`) and their
 *     required values disagree with the parity the graph's shape forces
 *     between them — see the dedicated comment further down, where the
 *     colouring is checked against those pins.
 *
 * DELIBERATE LIMIT: boolean variables are always checked here; ordinal
 * variables — thirtieth wave (Fix 3) — exactly when their whole component
 * shares one two-value option domain (see `ordinalComponentTwoValueDomain`);
 * datetime variables — thirty-first wave — exactly when their whole
 * component shares one exactly-enumerable two-instant stored-value domain at
 * one resolution (see `datetimeComponentTwoInstantDomain`); and categorical
 * variables — thirty-second wave (Fix 1) — exactly when every group's
 * effective SELECTION domain (its intersected option set under its merged
 * cardinality window) is the same two multiset selections (see
 * `categoricalComponentTwoValueDomain`). Larger or non-uniform domains still
 * bail to accept: the equivalent question there is general k-colourability
 * (for cycles) or arbitrary domain propagation (for pins), neither of which
 * has an efficient exact check for an arbitrary domain — that remains out of
 * scope and left to the interview runtime's own fill-time enforcement as a
 * backstop.
 *
 * `claimedPairs` (sorted `id\0id` keys) comes from
 * `pinnedEqualDifferentFromContradictions`, run once by the caller over ALL
 * types: a boolean pair already reported there — both ends pinned to the same
 * value (fifth-wave Finding 5, generalised by sixth-wave Finding 2) — is
 * excluded from the bipartite graph below so it isn't ALSO folded into a
 * report here.
 */
function oddDifferentFromCycleContradictions(
  variables: UnknownRecord,
  claimedPairs: Set<string>,
  stageEffectiveComponents: boolean,
  groupIntervalsByMember: ReadonlyMap<string, GroupIntervals>,
  unsatisfiableGroupMemberIds: ReadonlySet<string>,
  disequalityEmptiedMemberIds: ReadonlySet<string>,
  propagatedPins: ReadonlyMap<string, string | number>,
): ValidationContradiction[] {
  const edges = comparatorEdges(variables);
  const { groupOf, membersOf } = buildEqualityGroups(variables, edges);

  const found: ValidationContradiction[] = [];

  const edgesByKey = new Map<string, BooleanDifferentFromEdge>();
  const adjacency = new Map<string, Set<string>>();

  for (const [id, variable] of Object.entries(variables)) {
    const type = typeOf(variable);
    if (
      type !== 'boolean' &&
      type !== 'ordinal' &&
      type !== 'datetime' &&
      type !== 'categorical'
    ) {
      continue;
    }
    // `usableReference` guarantees same-typed endpoints, so the target
    // shares this variable's type — a component is never mixed-typed.
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

    // Thirtieth wave (Fix 3): a component is uniformly typed (every edge and
    // every equality-group union joins same-typed variables), so its first
    // member's type decides which domain model applies — the Set is
    // defensive, matching the rest of the file. An ordinal component is
    // judged ONLY when `ordinalComponentTwoValueDomain` validates it as one
    // shared two-value set; a datetime component — thirty-first wave — ONLY
    // when `datetimeComponentTwoInstantDomain` validates it as one shared
    // exactly-enumerable two-instant set; and a categorical component —
    // thirty-second wave (Fix 1) — ONLY when
    // `categoricalComponentTwoValueDomain` validates it as one shared
    // two-selection set. Any member with a different, larger, or
    // unenumerable domain bails the whole component to accept BEFORE any
    // structural check below runs, keeping the documented k-colourability
    // limit for genuinely larger domains.
    const componentTypes = new Set(
      queue.flatMap((group) =>
        (membersOf.get(group) ?? [group]).map((member) =>
          typeOf(variables[member]),
        ),
      ),
    );
    const [componentType] = componentTypes;
    if (componentTypes.size !== 1 || componentType === undefined) continue;
    const ordinalDomain =
      componentType === 'ordinal'
        ? ordinalComponentTwoValueDomain(
            variables,
            queue,
            membersOf,
            unsatisfiableGroupMemberIds,
          )
        : undefined;
    if (componentType === 'ordinal' && ordinalDomain === undefined) continue;
    const datetimeDomain =
      componentType === 'datetime'
        ? datetimeComponentTwoInstantDomain(
            variables,
            queue,
            membersOf,
            groupIntervalsByMember,
            unsatisfiableGroupMemberIds,
            disequalityEmptiedMemberIds,
            propagatedPins,
          )
        : undefined;
    if (componentType === 'datetime' && datetimeDomain === undefined) continue;
    const categoricalDomain =
      componentType === 'categorical'
        ? categoricalComponentTwoValueDomain(
            variables,
            queue,
            membersOf,
            unsatisfiableGroupMemberIds,
          )
        : undefined;
    if (componentType === 'categorical' && categoricalDomain === undefined) {
      continue;
    }
    const twoValueDomain = ordinalDomain ?? datetimeDomain ?? categoricalDomain;

    if (!bipartite) {
      if (!conflict) continue; // Type-narrowing only: bipartite is only ever
      // set false alongside `conflict ??= {...}` above, so this never fires.

      // Reconstruct ONE odd cycle: the conflict edge plus the BFS-tree path
      // between its two endpoints.
      const cycleGroups = pathBetween(parent, conflict.node, conflict.neighbor);
      if (cycleGroups.length === 0) continue;

      const cycleEdges = edgesAlongWalk(edgesByKey, cycleGroups, true);
      const chosenEdge = smallestKeyedEdge(cycleEdges);
      if (!chosenEdge) continue;
      const [first, ...rest] = chosenEdge.sources;
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
      continue;
    }

    // Twenty-third-wave Finding 2: this component IS bipartite, but that
    // alone does not mean it is satisfiable. Its two-colouring admits
    // exactly two globally-consistent value assignments — "colour 0 = true,
    // colour 1 = false", or the mirror image — and nothing about
    // bipartiteness picks WHICH one. A member whose own domain is a
    // SINGLETON (booleanDomain/sharedBooleanDomain collapse it to one of
    // {true, false} — e.g. a `component: 'Boolean'` field whose `options`
    // expose only one value) additionally FIXES that choice for the whole
    // component: reading its colour back against its required value says
    // which of the two assignments the component must use. A second,
    // independent singleton elsewhere in the SAME component is only
    // consistent with the first if it implies the SAME assignment — the
    // reviewer's `A={true}`, `B={true,false}`, `C={false}` with
    // `A differentFrom B` and `B differentFrom C` is exactly this: A and C
    // sit an EVEN number of hops apart (2, via B), so any single assignment
    // gives them the same value, yet they are pinned to opposite ones.
    //
    // Reads every boolean group's domain through `sharedBooleanDomain`
    // (itself built on `booleanDomain`), never `options` directly, so a
    // Toggle-rendered boolean (or one with no declared component) stays
    // unconditionally two-valued here exactly as it does everywhere else in
    // this file. An ordinal, datetime, or categorical component's pins were
    // already boolean-ized against its shared domain's reference value
    // (`ordinalComponentTwoValueDomain` /
    // `datetimeComponentTwoInstantDomain` /
    // `categoricalComponentTwoValueDomain`), so singleton-domain members of
    // those types interact with parity through exactly this same machinery.
    const singletonPins: SingletonPin[] = [];
    for (const group of queue) {
      let value: boolean | undefined;
      if (twoValueDomain) {
        value = twoValueDomain.pins.get(group);
      } else {
        const domain = sharedBooleanDomain(
          variables,
          membersOf.get(group) ?? [group],
          stageEffectiveComponents,
        );
        if (domain?.size === 1) [value] = domain;
      }
      const groupColor = color.get(group);
      if (value === undefined || groupColor === undefined) continue;
      singletonPins.push({ group, value, color: groupColor });
    }
    if (singletonPins.length < 2) continue;

    const agreeing = singletonPins
      .filter(matchesReferenceAssignment)
      .toSorted(byPinGroup);
    const disagreeing = singletonPins
      .filter((pin) => !matchesReferenceAssignment(pin))
      .toSorted(byPinGroup);
    if (agreeing.length === 0 || disagreeing.length === 0) continue;

    // Deterministic representative pair: the alphabetically-smallest pinned
    // group on each side of the disagreement.
    const [pinA] = agreeing;
    const [pinB] = disagreeing;
    if (!pinA || !pinB) continue;
    const conflictGroups = pathBetween(parent, pinA.group, pinB.group);
    if (conflictGroups.length === 0) continue;
    const conflictEdges = edgesAlongWalk(edgesByKey, conflictGroups, false);
    const chosenConflictEdge = smallestKeyedEdge(conflictEdges);
    if (!chosenConflictEdge) continue;
    const [conflictFirst, ...conflictRest] = chosenConflictEdge.sources;
    if (!conflictFirst) continue;
    const conflictMemberIds = [...new Set(conflictGroups)].flatMap(
      (group) => membersOf.get(group) ?? [],
    );
    const conflictNames = conflictMemberIds.map(
      (memberId) => `"${nameOf(memberId, variables[memberId])}"`,
    );
    found.push({
      class: 'pinnedDifferentFromParity',
      message: `Variables ${conflictNames.join(', ')}: their pinned values and differentFrom rules cannot all be satisfied together`,
      variableIds: conflictMemberIds,
      strips: [conflictFirst, ...conflictRest],
    });
  }

  return found;
}

type FindValidationContradictionsOptions = {
  /**
   * Twenty-sixth-wave Finding 1: the caller vouches that every variable's
   * `component` is its RESOLVED stage-effective rendering rather than a
   * codebook default a stage may still override. Only then may an explicit
   * `component: 'Boolean'` read its `options` as the participant-facing
   * domain (see `booleanDomain`). The record-level check
   * (`rejectValidationContradictions` in variable.ts) and the v7→v8
   * migration run with the default `false`; schema.ts's
   * `validateComposerFieldContradictions` passes `true` for the overlaid
   * stage-effective view it builds.
   */
  stageEffectiveComponents?: boolean;
};

export function findValidationContradictions(
  variables: UnknownRecord,
  options: FindValidationContradictionsOptions = {},
): ValidationContradiction[] {
  const stageEffectiveComponents = options.stageEffectiveComponents ?? false;
  // Twenty-second-wave Finding 1: computed first so its `propagatedPins`
  // closure can feed `pinnedEqualDifferentFromContradictions` below — the
  // array position of its own contradictions is unaffected, only the order
  // these two are CALLED in (spread order below still matches every other
  // pass).
  const {
    contradictions: disjointBoundsResults,
    propagatedPins,
    unsatisfiableGroupMemberIds,
    groupIntervalsByMember,
    disequalityEmptiedMemberIds,
  } = disjointBoundsContradictions(variables, stageEffectiveComponents);
  const { contradictions: pinnedEqualContradictions, claimedPairs } =
    pinnedEqualDifferentFromContradictions(
      variables,
      propagatedPins,
      unsatisfiableGroupMemberIds,
      stageEffectiveComponents,
    );
  return [
    ...localContradictions(variables),
    ...referenceStructureContradictions(variables),
    ...disjointBoundsResults,
    ...mixedResolutionSameAsContradictions(variables),
    ...pinnedEqualContradictions,
    ...oddDifferentFromCycleContradictions(
      variables,
      claimedPairs,
      stageEffectiveComponents,
      groupIntervalsByMember,
      unsatisfiableGroupMemberIds,
      disequalityEmptiedMemberIds,
      // Thirty-fourth wave (Fix 3): the chain pass's singleton collapses
      // qualify the datetime two-instant parity domains — a strictly
      // downstream, read-only consumption (see the ORDERING note on
      // `datetimeComponentTwoInstantDomain`).
      propagatedPins,
    ),
  ];
}
