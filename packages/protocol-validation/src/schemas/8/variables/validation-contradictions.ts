import type { ValidationName } from './validation.ts';

type UnknownRecord = Record<string, unknown>;

export type ContradictionClass =
  | 'invertedBounds'
  | 'minSelectedExceedsOptions'
  | 'conflictingReferencePair'
  | 'strictComparatorCycle'
  | 'sameAsGroupConflict'
  | 'disjointBounds';

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

const optionCount = (variable: unknown): number | undefined => {
  const options = asRecord(variable)?.options;
  return Array.isArray(options) ? options.length : undefined;
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
    const options = optionCount(variable);
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

// Variable ids never contain a NUL, so joining on one cannot collide.
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
 * chain back to its start is the same shape. Iterative-safe Tarjan (the
 * `strongconnect` recursion is still used, but variable counts per entity
 * are small enough that stack depth is not a practical concern).
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

  const strongconnect = (node: string): void => {
    index.set(node, counter);
    lowlink.set(node, counter);
    counter += 1;
    stack.push(node);
    onStack.add(node);

    for (const next of adjacency.get(node) ?? []) {
      if (!index.has(next)) {
        strongconnect(next);
        const nodeLow = lowlink.get(node);
        const nextLow = lowlink.get(next);
        if (nodeLow !== undefined && nextLow !== undefined) {
          lowlink.set(node, Math.min(nodeLow, nextLow));
        }
      } else if (onStack.has(next)) {
        const nodeLow = lowlink.get(node);
        const nextIndex = index.get(next);
        if (nodeLow !== undefined && nextIndex !== undefined) {
          lowlink.set(node, Math.min(nodeLow, nextIndex));
        }
      }
    }

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
  };

  for (const node of adjacency.keys()) {
    if (!index.has(node)) strongconnect(node);
  }

  return components.filter((component) => component.length > 1);
}

/**
 * The equality groups a set of variables collapse into: the union of (a)
 * `sameAs` edges — symmetric and transitive, every chain member ends up
 * holding one value — and (b) strongly-connected components of the
 * non-strict comparator graph (Finding E), which force their members equal
 * the same way. Both sources feed one union-find so every downstream group
 * check (strict-comparator-in-group, differentFrom-in-group, interval and
 * option-set intersection) sees the combined membership.
 */
function buildEqualityGroups(
  variables: UnknownRecord,
  edges: ComparatorEdge[],
): {
  groupOf: Map<string, string>;
  membersOf: Map<string, string[]>;
} {
  const parent = new Map<string, string>();
  for (const id of Object.keys(variables)) parent.set(id, id);

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
 * a strict edge are unsatisfiable and reported.
 */
function findStrictCycles(
  dependencies: Map<string, Map<string, GroupEdge>>,
): { groups: string[]; sources: VariableRuleRef[] }[] {
  const results: { groups: string[]; sources: VariableRuleRef[] }[] = [];
  const reported = new Set<string>();
  const state = new Map<string, 'visiting' | 'done'>();

  const visit = (group: string, stack: string[]): void => {
    const current = state.get(group);
    if (current === 'done') return;
    if (current === 'visiting') {
      const start = stack.indexOf(group);
      const cycle = stack.slice(start === -1 ? 0 : start);
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
      return;
    }
    state.set(group, 'visiting');
    for (const dependency of dependencies.get(group)?.keys() ?? []) {
      visit(dependency, [...stack, group]);
    }
    state.set(group, 'done');
  };

  for (const group of dependencies.keys()) visit(group, []);
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

type Interval = { min?: number; max?: number };

const DATE_PART_PATTERN = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/;

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
  // Day 0 of the following month is the last day of `month`.
  const day =
    match[3] !== undefined
      ? Number(match[3])
      : edge === 'min'
        ? 1
        : new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Date.UTC(year, month - 1, day) / 86_400_000;
};

const dateWindowInterval = (variable: unknown): Interval | undefined => {
  const record = asRecord(variable);
  // RelativeDatePicker windows are anchored to the interview date and
  // contribute no static bounds.
  if (!record || record.component === 'RelativeDatePicker') return undefined;
  const parameters = asRecord(record.parameters);
  if (!parameters) return undefined;
  const min =
    typeof parameters.min === 'string'
      ? dayNumber(parameters.min, 'min')
      : undefined;
  const max =
    typeof parameters.max === 'string'
      ? dayNumber(parameters.max, 'max')
      : undefined;
  if (min === undefined && max === undefined) return undefined;
  return { min, max };
};

const intervalOf = (variable: unknown): Interval | undefined => {
  switch (typeOf(variable)) {
    case 'number':
      return {
        min: numberRule(variable, 'minValue'),
        max: numberRule(variable, 'maxValue'),
      };
    case 'text':
      return {
        min: numberRule(variable, 'minLength'),
        max: numberRule(variable, 'maxLength'),
      };
    case 'categorical':
      return {
        min: numberRule(variable, 'minSelected'),
        max: numberRule(variable, 'maxSelected'),
      };
    case 'datetime':
      return dateWindowInterval(variable);
    default:
      return undefined;
  }
};

const intersect = (
  a: Interval | undefined,
  b: Interval | undefined,
): Interval | undefined => {
  if (!a) return b;
  if (!b) return a;
  return {
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
  };
};

const isEmptyInterval = (interval: Interval | undefined): boolean =>
  interval?.min !== undefined &&
  interval.max !== undefined &&
  interval.min > interval.max;

/**
 * A variable's option values, for the categorical/ordinal `sameAs`-group
 * check (Finding D). `undefined` — not an empty set — means "unusable for
 * this check": raw migration input may not have an `options` array at all,
 * and that must skip the check rather than be treated as zero options.
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

/**
 * The rules a group-level emptiness conflict (interval or, for Finding D,
 * option-value-set) resolves by stripping: every member's `sameAs` (the
 * pre-Finding-E policy) plus, since a group can now also be forced together
 * by a non-strict comparator cycle, every non-strict comparator edge whose
 * both ends fall inside this group. A purely `sameAs` group yields only the
 * first; a purely comparator-forced group (no member has `sameAs` at all)
 * yields only the second.
 */
const groupEqualityStrips = (
  variables: UnknownRecord,
  members: string[],
  internalNonStrictEdges: ComparatorEdge[],
): VariableRuleRef[] => {
  const sameAsStrips = members
    .filter((member) => hasUsableSameAs(variables, member))
    .map((member): VariableRuleRef => ({ variableId: member, rule: 'sameAs' }));
  const comparatorStrips = internalNonStrictEdges.flatMap(
    (edge) => edge.sources,
  );
  return [...sameAsStrips, ...comparatorStrips];
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

  const groupIntervals = new Map<string, Interval | undefined>();
  for (const [group, members] of membersOf) {
    let interval: Interval | undefined;
    for (const member of members) {
      interval = intersect(interval, intervalOf(variables[member]));
    }
    groupIntervals.set(group, interval);

    const internalNonStrictEdges =
      internalNonStrictEdgesByGroup.get(group) ?? [];

    if (members.length > 1 && isEmptyInterval(interval)) {
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
          }
        }
      }
    }
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
    const upperInterval = groupIntervals.get(upperGroup);
    const lowerInterval = groupIntervals.get(lowerGroup);
    // An already-empty group is reported above; its sameAs strips resolve it
    // first, so edges touching it are not judged against nonsense bounds.
    if (isEmptyInterval(upperInterval) || isEmptyInterval(lowerInterval)) {
      continue;
    }
    if (upperInterval?.max === undefined || lowerInterval?.min === undefined) {
      continue;
    }
    const infeasible = edge.strict
      ? upperInterval.max <= lowerInterval.min
      : upperInterval.max < lowerInterval.min;
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

export function findValidationContradictions(
  variables: UnknownRecord,
): ValidationContradiction[] {
  return [
    ...localContradictions(variables),
    ...referenceStructureContradictions(variables),
    ...disjointBoundsContradictions(variables),
  ];
}
