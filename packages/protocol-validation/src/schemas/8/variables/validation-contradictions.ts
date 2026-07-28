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
 * Strongly-connected components of the non-strict canonical comparator
 * subgraph, treating each `{ lower, upper }` edge as directed lower→upper
 * ("lower is at most upper"). A component with more than one member is a set
 * of variables a non-strict comparator cycle forces to hold one shared value
 * — `a >= b` plus `b >= a` is the two-node case; a longer all-non-strict
 * chain back to its start is the same shape. Eleventh-wave Finding 2: Tarjan
 * runs with an explicit frame stack rather than recursion — the analyser runs
 * inside protocol parsing AND the v7→v8 migration, so a large imported
 * protocol must not crash the import with a RangeError. The frames replay the
 * recursive visit order exactly (same neighbour order, same component
 * emission order).
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

  return components.filter((component) => component.length > 1);
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

  const edges = comparatorEdges(variables);
  const { groupOf, membersOf } = buildEqualityGroups(variables, edges);

  // Group-level comparator dependency graph (upper depends on lower). An edge
  // whose ends fall inside one group is a class-9 conflict when strict.
  const dependencies = new Map<string, Map<string, GroupEdge>>();
  for (const edge of edges) {
    const upper = groupOf.get(edge.upper);
    const lower = groupOf.get(edge.lower);
    if (upper === undefined || lower === undefined) continue;
    if (upper === lower) {
      if (!edge.strict) continue;
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
 * A date bound as a UTC day number. A partial date expands to its earliest
 * day for a `min` bound and its latest for a `max` bound, so coarse
 * resolutions are compared conservatively.
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
 */
const isRelativeDatePickerShape = (parameters: UnknownRecord): boolean =>
  RELATIVE_DATE_PICKER_PARAMETER_KEYS.some(
    (key) => parameters[key] !== undefined,
  ) && !DATE_PICKER_PARAMETER_KEYS.some((key) => parameters[key] !== undefined);

const dateWindowInterval = (variable: unknown): Interval | undefined => {
  const record = asRecord(variable);
  if (!record) return undefined;
  const parameters = asRecord(record.parameters);
  if (!parameters) return undefined;
  if (
    record.component === 'RelativeDatePicker' ||
    (record.component === undefined && isRelativeDatePickerShape(parameters))
  ) {
    return relativeDateWindowInterval(parameters);
  }
  const min =
    typeof parameters.min === 'string'
      ? dayNumber(parameters.min, 'min')
      : undefined;
  const max =
    typeof parameters.max === 'string'
      ? dayNumber(parameters.max, 'max')
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
 * `differentFrom` check (fifth-wave Finding 5). `booleanOptionsSchema`
 * (variable.ts) permits an `options` array exposing only one of {true,
 * false} — unlike `optionValues` above, ABSENT options data falls back to the
 * full two-value domain rather than being treated as unusable: an
 * options-less boolean renders fresco-ui's BooleanField Yes/No default, so
 * the unrestricted domain is the correct model.
 *
 * Thirteenth-wave Finding 2: an EXPLICITLY EMPTY array is different, and no
 * longer shares that fallback. BooleanField defaults its options only when
 * the prop is `undefined`, so `options: []` renders no buttons at all and
 * offers no value — modelling it as both values made the analyser reason
 * over values the runtime never exposes. The schema now rejects it outright;
 * this keeps the two layers agreeing on raw (pre-schema) migration input
 * too. A NON-empty array carrying no usable boolean value is malformed
 * rather than deliberately empty, so it keeps the two-value fallback.
 */
const booleanDomain = (variable: unknown): Set<boolean> => {
  const options = asRecord(variable)?.options;
  if (!Array.isArray(options)) return new Set([true, false]);
  if (options.length === 0) return new Set();
  const domain = new Set<boolean>();
  for (const option of options) {
    const value = asRecord(option)?.value;
    if (typeof value === 'boolean') domain.add(value);
  }
  return domain.size > 0 ? domain : new Set([true, false]);
};

type DateResolution = 'full' | 'month' | 'year';

/**
 * A datetime variable's storage resolution, for the mixed-resolution
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
 */
const dateResolutionOf = (variable: unknown): DateResolution => {
  const record = asRecord(variable);
  if (record === null) return 'full';
  if (record.component !== undefined && record.component !== 'DatePicker') {
    return 'full';
  }
  const type = asRecord(record.parameters)?.type;
  return type === 'month' || type === 'year' ? type : 'full';
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
 * The rules a group-level emptiness conflict (interval or, for Finding D,
 * option-value-set) resolves by stripping: every member's `sameAs` when the
 * group has any (the pre-Finding-E policy) — otherwise, since a group can
 * also be forced together purely by a non-strict comparator cycle, every
 * non-strict comparator edge whose both ends fall inside this group.
 *
 * Ninth-wave Finding 3: a group with at least one `sameAs` edge strips ONLY
 * the `sameAs` edges, never `internalNonStrictEdges` too. A "hybrid" group —
 * `sameAs`-joined members that also happen to have a one-way non-strict
 * comparator sitting between two of them (e.g. A sameAs B, plus A <= B) —
 * previously stripped that comparator as well, even though it never forced
 * the grouping (only a `sameAs` edge, or a genuine strongly-connected
 * comparator cycle, does that — see `buildEqualityGroups`). Stripping
 * `sameAs` alone already resolves the group; the comparator is an
 * independent, still-satisfiable rule and the minimal-strip policy leaves it
 * standing. `internalNonStrictEdges` is only ever non-empty AND relevant when
 * `sameAsStrips` is empty, since a no-`sameAs` group is formed exclusively by
 * union()-ing one strongly-connected component's own members (see
 * `buildEqualityGroups`), so those edges are then genuinely the ones that
 * forced the group to exist.
 */
const groupEqualityStrips = (
  variables: UnknownRecord,
  members: string[],
  internalNonStrictEdges: ComparatorEdge[],
): VariableRuleRef[] => {
  const sameAsStrips = members
    .filter((member) => hasUsableSameAs(variables, member))
    .map((member): VariableRuleRef => ({ variableId: member, rule: 'sameAs' }));
  if (sameAsStrips.length > 0) return sameAsStrips;
  return internalNonStrictEdges.flatMap((edge) => edge.sources);
};

function disjointBoundsContradictions(
  variables: UnknownRecord,
): ValidationContradiction[] {
  const found: ValidationContradiction[] = [];
  const edges = comparatorEdges(variables);
  const { groupOf, membersOf } = buildEqualityGroups(variables, edges);

  // Non-strict comparator edges whose both ends fall inside one equality
  // group, bucketed by that group — the rules a comparator-forced group's
  // emptiness conflict strips (see `groupEqualityStrips`).
  const internalNonStrictEdgesByGroup = new Map<string, ComparatorEdge[]>();
  for (const edge of edges) {
    if (edge.strict) continue;
    const lowerGroup = groupOf.get(edge.lower);
    const upperGroup = groupOf.get(edge.upper);
    if (
      lowerGroup === undefined ||
      upperGroup === undefined ||
      lowerGroup !== upperGroup
    ) {
      continue;
    }
    const bucket = internalNonStrictEdgesByGroup.get(lowerGroup) ?? [];
    bucket.push(edge);
    internalNonStrictEdgesByGroup.set(lowerGroup, bucket);
  }

  const groupIntervals = new Map<string, GroupIntervals>();
  for (const [group, members] of membersOf) {
    const intervals: GroupIntervals = new Map();
    for (const member of members) {
      addToGroupIntervals(intervals, intervalOf(variables[member]));
    }
    groupIntervals.set(group, intervals);

    const internalNonStrictEdges =
      internalNonStrictEdgesByGroup.get(group) ?? [];

    if (members.length > 1 && hasEmptyOrigin(intervals)) {
      const strips = groupEqualityStrips(
        variables,
        members,
        internalNonStrictEdges,
      );
      const [first, ...rest] = strips;
      if (first) {
        const names = members.map(
          (member) => `"${nameOf(member, variables[member])}"`,
        );
        found.push({
          class: 'disjointBounds',
          message: `Variables ${names.join(', ')} ${groupEqualityDescription(variables, members)} but their rules leave no value they can share`,
          variableIds: members,
          strips: [first, ...rest],
        });
      }
    }

    // Finding D: a sameAs-joined categorical/ordinal group whose members'
    // option value sets share nothing is equally unsatisfiable — no value
    // any member offers is a value every member offers. Comparators never
    // apply to these types (see `requireType` on the four comparator
    // rules), so such a group can only ever be sameAs-forced; the shared
    // strip/message helpers still handle the general case defensively.
    if (members.length > 1) {
      const types = new Set(members.map((member) => typeOf(variables[member])));
      const [onlyType] = types;
      if (
        types.size === 1 &&
        (onlyType === 'categorical' || onlyType === 'ordinal')
      ) {
        const memberOptionValues: Set<string | number>[] = [];
        let everyMemberHasOptions = true;
        for (const member of members) {
          const values = optionValues(variables[member]);
          if (values === undefined) {
            everyMemberHasOptions = false;
            break;
          }
          memberOptionValues.push(values);
        }
        const [firstValues, ...restValues] = memberOptionValues;
        if (everyMemberHasOptions && firstValues) {
          let intersection = firstValues;
          for (const values of restValues) {
            intersection = new Set(
              [...intersection].filter((value) => values.has(value)),
            );
          }
          if (intersection.size === 0) {
            const strips = groupEqualityStrips(
              variables,
              members,
              internalNonStrictEdges,
            );
            const [first, ...rest] = strips;
            if (first) {
              const names = members.map(
                (member) => `"${nameOf(member, variables[member])}"`,
              );
              found.push({
                class: 'disjointBounds',
                message: `Variables ${names.join(', ')} ${groupEqualityDescription(variables, members)} but share no option values`,
                variableIds: members,
                strips: [first, ...rest],
              });
            }
          } else if (onlyType === 'categorical' && !hasEmptyOrigin(intervals)) {
            // Non-empty but too small: the group's intersected minSelected
            // (already computed above as the fixed-origin interval's `min` —
            // the group interval pass intersects every member's own
            // minSelected, and selection counts are always absolute) can still
            // exceed the number of option values every member actually
            // shares, which is equally unsatisfiable. Ordinal is excluded —
            // it is single-select, so any non-empty shared set already
            // suffices and is covered by the emptiness check above. Skipped
            // when the group's own bounds are already empty — that case is
            // reported above and resolves via the same strips.
            const minSelected = intervals.get('fixed')?.min;
            if (minSelected !== undefined && minSelected > intersection.size) {
              const strips = groupEqualityStrips(
                variables,
                members,
                internalNonStrictEdges,
              );
              const [first, ...rest] = strips;
              if (first) {
                const names = members.map(
                  (member) => `"${nameOf(member, variables[member])}"`,
                );
                found.push({
                  class: 'disjointBounds',
                  message: `Variables ${names.join(', ')} ${groupEqualityDescription(variables, members)} but share only ${intersection.size} option values, fewer than minSelected (${minSelected})`,
                  variableIds: members,
                  strips: [first, ...rest],
                });
              }
            }
          }
        }
      }
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
    if (members.length > 1) {
      const booleanTypes = new Set(
        members.map((member) => typeOf(variables[member])),
      );
      const [onlyBooleanType] = booleanTypes;
      if (booleanTypes.size === 1 && onlyBooleanType === 'boolean') {
        let domainIntersection: Set<boolean> | undefined;
        for (const member of members) {
          const domain = booleanDomain(variables[member]);
          domainIntersection =
            domainIntersection === undefined
              ? domain
              : new Set(
                  [...domainIntersection].filter((value) => domain.has(value)),
                );
        }
        if (domainIntersection !== undefined && domainIntersection.size === 0) {
          const strips = groupEqualityStrips(
            variables,
            members,
            internalNonStrictEdges,
          );
          const [first, ...rest] = strips;
          if (first) {
            const names = members.map(
              (member) => `"${nameOf(member, variables[member])}"`,
            );
            found.push({
              class: 'disjointBounds',
              message: `Variables ${names.join(', ')} ${groupEqualityDescription(variables, members)} but their available values never overlap`,
              variableIds: members,
              strips: [first, ...rest],
            });
          }
        }
      }
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
    const queue: string[] = [start];
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

    while (queue.length > 0) {
      const node = queue.shift();
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
