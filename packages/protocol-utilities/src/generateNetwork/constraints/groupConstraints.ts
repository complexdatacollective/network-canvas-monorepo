import type { VariableEntry, VariableOptionInput } from '../../types';
import { addSteps, type DateResolution } from './dateWindow';
import {
  canonicalComparatorEdges,
  type ComparatorEdge,
  KEY_SEPARATOR,
} from './dependencyOrder';
import type {
  ConstrainedVariable,
  EntityConstraints,
  VariableConstraints,
} from './types';
import { SCALAR_DECIMAL_PLACES } from './valueSpace';

/**
 * Keeps whichever of two bounds is tighter. Dates are compared as strings,
 * which orders them correctly as long as both are written at the same
 * resolution — every caller here checks that first.
 */
export function tighten<T extends number | string>(
  current: T | undefined,
  candidate: T | undefined,
  keepHigher: boolean,
): T | undefined {
  if (candidate === undefined) return current;
  if (current === undefined) return candidate;
  const candidateIsTighter = keepHigher
    ? candidate > current
    : candidate < current;
  return candidateIsTighter ? candidate : current;
}

/**
 * The values a variable's own type lets it hold, where that type is one whose
 * domain a researcher writes out as options. `ordinal` and `categorical` are
 * the two the codebook gives an option list to, and the two a draw picks from.
 * A boolean's `options` label `true` and `false` rather than describing a
 * domain — nothing draws from them, and the codebook's boolean values are
 * dropped on the way in — so a boolean has none of its own here.
 */
function optionDomain(
  variable: ConstrainedVariable,
): VariableOptionInput[] | undefined {
  const { entry } = variable;
  if (entry.type !== 'ordinal' && entry.type !== 'categorical') {
    return undefined;
  }
  return entry.options ?? [];
}

/**
 * The option values every member of a group that has options offers, or
 * `undefined` where no member has any and there is nothing to intersect.
 *
 * A member with no options of its own is passed over rather than emptying the
 * intersection. `sameAs` between an ordinal and a text variable is already a
 * rule the runtime cannot check — the two types share no value of any kind — so
 * which options the ordinal keeps is not what is wrong with that pairing, and
 * reading "offers no options" as "shares none of them" would refuse every such
 * pairing for a reason naming nothing a researcher could correct.
 */
function sharedOptionValues(
  members: readonly ConstrainedVariable[],
): Set<VariableOptionInput['value']> | undefined {
  let shared: Set<VariableOptionInput['value']> | undefined;

  for (const member of members) {
    const options = optionDomain(member);
    if (options === undefined) continue;

    const offered = new Set(options.map((option) => option.value));
    shared =
      shared === undefined
        ? offered
        : new Set([...shared].filter((value) => offered.has(value)));
  }

  return shared;
}

/**
 * The entry a group draws against: the representative's, offering only the
 * options every member can hold. Two ordinals held equal over `{1, 2}` and
 * `{3, 4}` would otherwise draw the representative's `1`, which the other
 * member's field cannot show and its validator cannot accept.
 *
 * Members sharing no option at all keep the representative's own, the way
 * `propagateComparatorBounds` keeps a group's declared range when its bounds
 * cross over: the feasibility pass refuses that protocol either way, and until
 * it does, a value one member can hold beats the nothing an empty option list
 * draws.
 */
function intersectEntry(
  representative: ConstrainedVariable,
  members: readonly ConstrainedVariable[],
): VariableEntry {
  const options = representative.entry.options;
  if (optionDomain(representative) === undefined || options === undefined) {
    return representative.entry;
  }

  const shared = sharedOptionValues(members);
  if (shared === undefined) return representative.entry;

  const narrowed = options.filter((option) => shared.has(option.value));
  if (narrowed.length === 0 || narrowed.length === options.length) {
    return representative.entry;
  }

  return { ...representative.entry, options: narrowed };
}

/**
 * The rules the single value shared by a `sameAs` group must satisfy: the
 * tightest of every member's bounds rather than any one member's. A member
 * capped at `maxLength: 24` joined to one requiring `minLength: 24` needs a
 * value of exactly 24 characters, which neither member alone would produce.
 *
 * The representative supplies the type, since a `sameAs` between variables of
 * different types has no meaning the runtime could check.
 */
function intersectConstraints(
  members: readonly ConstrainedVariable[],
  representative: ConstrainedVariable,
): VariableConstraints {
  let required = false;
  let unique = false;
  let minLength: number | undefined;
  let maxLength: number | undefined;
  let minValue: number | undefined;
  let maxValue: number | undefined;
  let minSelected: number | undefined;
  let maxSelected: number | undefined;

  const resolution = representative.constraints.dateWindow?.resolution;
  let windowMin: string | undefined;
  let windowMax: string | undefined;

  for (const { constraints } of members) {
    required ||= constraints.required;
    unique ||= constraints.unique;
    minLength = tighten(minLength, constraints.minLength, true);
    maxLength = tighten(maxLength, constraints.maxLength, false);
    minValue = tighten(minValue, constraints.minValue, true);
    maxValue = tighten(maxValue, constraints.maxValue, false);
    minSelected = tighten(minSelected, constraints.minSelected, true);
    maxSelected = tighten(maxSelected, constraints.maxSelected, false);

    // Bounds written at different resolutions do not compare as strings, so
    // only a window matching the representative's resolution contributes.
    const window = constraints.dateWindow;
    if (window !== undefined && window.resolution === resolution) {
      windowMin = tighten(windowMin, window.min, true);
      windowMax = tighten(windowMax, window.max, false);
    }
  }

  return {
    required,
    unique,
    ...(minLength !== undefined ? { minLength } : {}),
    ...(maxLength !== undefined ? { maxLength } : {}),
    ...(minValue !== undefined ? { minValue } : {}),
    ...(maxValue !== undefined ? { maxValue } : {}),
    ...(minSelected !== undefined ? { minSelected } : {}),
    ...(maxSelected !== undefined ? { maxSelected } : {}),
    ...(resolution !== undefined
      ? {
          dateWindow: {
            resolution,
            ...(windowMin !== undefined ? { min: windowMin } : {}),
            ...(windowMax !== undefined ? { max: windowMax } : {}),
          },
        }
      : {}),
  };
}

/**
 * Each group's combined rules, keyed by its representative id.
 *
 * The generator and the feasibility pass both read this, because both have to
 * describe the same value: a group draws once against the intersection, so a
 * `unique` value space measured against one member's own bounds would describe
 * a space the generator never draws from.
 */
export function intersectGroupConstraints(
  entity: EntityConstraints,
  membersOf: Map<string, string[]>,
): Map<string, ConstrainedVariable> {
  const groups = new Map<string, ConstrainedVariable>();

  for (const [group, memberIds] of membersOf) {
    const representative = entity.get(group);
    if (representative === undefined) continue;

    const members: ConstrainedVariable[] = [];
    for (const id of memberIds) {
      const member = entity.get(id);
      if (member !== undefined) members.push(member);
    }

    groups.set(group, {
      entry: intersectEntry(representative, members),
      constraints: intersectConstraints(members, representative),
    });
  }

  return groups;
}

/** Something a group's members leave no value between them for. */
type EmptyGroupBound = {
  /** The constraint keys that cross. */
  rules: string[];
  /** What crossed, worded as the per-variable checks word it. */
  detail: string;
};

const INTERSECTED_BOUNDS = [
  { min: 'minValue', max: 'maxValue' },
  { min: 'minLength', max: 'maxLength' },
  { min: 'minSelected', max: 'maxSelected' },
] as const;

/**
 * Said of a bound pair a member's own declaration already crosses, so the group
 * conflict and the per-variable conflict raised for that member cannot be read
 * as the same fact reported twice.
 */
const ALSO_DECLARED =
  ', which one of these variables already declares on its own';

/** What a member offers, as the researcher reads it: `"Rating A" (1, 2)`. */
function offeredBy(member: ConstrainedVariable): string {
  const values = (optionDomain(member) ?? [])
    .map((option) => String(option.value))
    .join(', ');

  return `"${member.entry.name}" (${values === '' ? 'none' : values})`;
}

/**
 * The options a group's members leave it nothing to choose from, or too little.
 *
 * Two members that offer no option value in common describe a field neither can
 * show the other's answer in, and the rule holding them equal has no solution
 * at all. Members that overlap in fewer options than the group's `minSelected`
 * asks for are the same fact one step along: the selection cannot be made from
 * what is left, however many options either member offers on its own.
 *
 * Both need two members with options of their own to be about the group rather
 * than about one variable. With one, the values left are that variable's own
 * and the per-variable checks already have whatever there is to say.
 */
function emptyGroupOptions(
  members: readonly ConstrainedVariable[],
  intersected: VariableConstraints,
): EmptyGroupBound[] {
  const offering = members.filter(
    (member) => optionDomain(member) !== undefined,
  );
  const shared = sharedOptionValues(offering);
  if (offering.length < 2 || shared === undefined) return [];

  const offered = offering.map(offeredBy).join(' and by ');

  if (shared.size === 0) {
    return [
      {
        rules: ['options'],
        detail: `the options offered by ${offered} have no value in common`,
      },
    ];
  }

  const { minSelected } = intersected;
  if (minSelected === undefined || minSelected <= shared.size) return [];

  const memberFallsShort = offering.some(({ entry, constraints }) => {
    const own = entry.options?.length ?? 0;
    return (
      constraints.minSelected !== undefined &&
      own > 0 &&
      constraints.minSelected > own
    );
  });

  return [
    {
      rules: ['minSelected', 'options'],
      detail: `minSelected ${minSelected} exceeds the ${shared.size} option${
        shared.size === 1 ? '' : 's'
      } shared by ${offered}${memberFallsShort ? ALSO_DECLARED : ''}`,
    },
  ];
}

/**
 * The bounds a group's intersected rules leave nothing between.
 *
 * A group holds one value for all of its members, so that value has to satisfy
 * every member's bounds at once. `sameAs`, and a cycle of non-strict
 * comparators, can merge members whose own ranges are each satisfiable into a
 * group whose intersection is empty — `[1, 5]` held equal to `[?, 0]` describes
 * a value that is both at least 1 and at most 0. An option list is a bound of
 * the same kind, and crosses the same way.
 *
 * A bound pair one member's own declaration already crosses is reported too,
 * worded so it reads as the separate thing it is. The per-variable check names
 * only that member, and correcting what it names need not leave the group
 * satisfiable — `minLength 10`/`maxLength 2` held equal to `maxLength 4` still
 * has nothing between 10 and 4 once the member's own pair is put right. Leaving
 * it out costs a researcher a second round trip to find that out.
 */
export function emptyGroupBounds(
  members: readonly ConstrainedVariable[],
  intersected: VariableConstraints,
): EmptyGroupBound[] {
  const empty: EmptyGroupBound[] = [];

  for (const { min, max } of INTERSECTED_BOUNDS) {
    const floor = intersected[min];
    const ceiling = intersected[max];
    if (floor === undefined || ceiling === undefined || floor <= ceiling) {
      continue;
    }

    const memberCrosses = members.some(({ constraints }) => {
      const ownFloor = constraints[min];
      const ownCeiling = constraints[max];
      return (
        ownFloor !== undefined &&
        ownCeiling !== undefined &&
        ownFloor > ownCeiling
      );
    });

    empty.push({
      rules: [min, max],
      detail: `${min} ${floor} exceeds ${max} ${ceiling}${
        memberCrosses ? ALSO_DECLARED : ''
      }`,
    });
  }

  const window = intersected.dateWindow;
  const windowCrosses =
    window?.min !== undefined &&
    window.max !== undefined &&
    window.min > window.max;
  const memberWindowCrosses = members.some(({ constraints }) => {
    const own = constraints.dateWindow;
    return own?.min !== undefined && own.max !== undefined && own.min > own.max;
  });

  if (windowCrosses) {
    empty.push({
      rules: ['parameters'],
      detail: `the date range ${window.min} to ${window.max} is empty${
        memberWindowCrosses ? ALSO_DECLARED : ''
      }`,
    });
  }

  empty.push(...emptyGroupOptions(members, intersected));

  return empty;
}

/** The gap a strict comparator must leave, in the units the type is drawn in. */
export function comparatorGap(type: 'number' | 'scalar'): number {
  return type === 'scalar' ? 10 ** -SCALAR_DECIMAL_PLACES : 1;
}

/**
 * Which groups each group's value must differ from.
 *
 * `differentFrom` binds both of its ends, so the pair is recorded from both:
 * the ordering pass keeps one dependency edge per pair and drops it entirely
 * when it would close a cycle, which leaves the group that declared the rule as
 * likely to be drawn first as the group it names.
 */
export function differentFromGroups(
  entity: EntityConstraints,
  groupOf: Map<string, string>,
): Map<string, Set<string>> {
  const excluded = new Map<string, Set<string>>();

  const link = (from: string, to: string): void => {
    const targets = excluded.get(from) ?? new Set<string>();
    targets.add(to);
    excluded.set(from, targets);
  };

  for (const [id, variable] of entity) {
    const targetId = variable.constraints.differentFrom;
    if (targetId === undefined || !entity.has(targetId)) continue;

    const group = groupOf.get(id) ?? id;
    const target = groupOf.get(targetId) ?? targetId;
    // One group holds a single value, which cannot differ from itself;
    // `resolveGenerationOrder` reports that as a contradiction.
    if (group === target) continue;

    link(group, target);
    link(target, group);
  }

  return excluded;
}

/**
 * Every comparator in the entity, rewritten as an ordering between the groups
 * that hold the two values. Both ends of an edge inside one group are the same
 * value, so nothing is left to order — a strict comparator of that shape is a
 * contradiction `resolveGenerationOrder` already reports.
 */
export function groupComparatorEdges(
  entity: EntityConstraints,
  groupOf: Map<string, string>,
): ComparatorEdge[] {
  const edges: ComparatorEdge[] = [];
  const seen = new Set<string>();

  for (const edge of canonicalComparatorEdges(entity)) {
    const lower = groupOf.get(edge.lower) ?? edge.lower;
    const upper = groupOf.get(edge.upper) ?? edge.upper;
    if (lower === upper) continue;

    const key = [lower, upper, String(edge.strict)].join(KEY_SEPARATOR);
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ lower, upper, strict: edge.strict });
  }

  return edges;
}

/** A group's bounds while propagation is narrowing them. */
type Range = {
  minValue: number | undefined;
  maxValue: number | undefined;
  windowMin: string | undefined;
  windowMax: string | undefined;
};

/**
 * How far apart a strict comparator provably holds its two ends: the finer of
 * the two ends' granularities, or one unit at the resolution both date windows
 * share. `gridUpper`/`gridLower` say which end sits on the scalar grid, so the
 * bound stepped towards that end can be rounded back onto it.
 */
export type Span =
  | { kind: 'numeric'; gap: number; gridUpper: boolean; gridLower: boolean }
  | { kind: 'date'; resolution: DateResolution };

function isNumeric(variable: ConstrainedVariable): boolean {
  return variable.entry.type === 'number' || variable.entry.type === 'scalar';
}

/**
 * Comparisons the generator cannot step across — a number against a date, or
 * two dates written at different resolutions, whose bounds would not even
 * compare as strings — leave nothing to propagate.
 *
 * The numeric gap is the finer of the two ends' granularities, which is the
 * largest step a strict comparison is guaranteed to leave: both ends are
 * multiples of it, so any two distinct values differ by at least it. Stepping
 * by the coarser end's unit instead over-tightens — a scalar strictly below a
 * number pinned to 1 still reaches 0.99, not 0 — and an over-tight bound turns
 * satisfiable protocols into refusals.
 */
export function comparatorSpan(
  lower: ConstrainedVariable,
  upper: ConstrainedVariable,
): Span | undefined {
  if (isNumeric(lower) && isNumeric(upper)) {
    const gridUpper = upper.entry.type === 'scalar';
    const gridLower = lower.entry.type === 'scalar';
    return {
      kind: 'numeric',
      gap: Math.min(
        comparatorGap(gridUpper ? 'scalar' : 'number'),
        comparatorGap(gridLower ? 'scalar' : 'number'),
      ),
      gridUpper,
      gridLower,
    };
  }

  if (lower.entry.type !== 'datetime' || upper.entry.type !== 'datetime') {
    return undefined;
  }

  const resolution = upper.constraints.dateWindow?.resolution;
  if (
    resolution === undefined ||
    lower.constraints.dateWindow?.resolution !== resolution
  ) {
    return undefined;
  }

  return { kind: 'date', resolution };
}

/**
 * Scalars are drawn on a fixed decimal grid, and adding the gap in binary
 * floating point lands just beside it; a bound off that grid is one every draw
 * would be clamped up to.
 */
function onGrid(value: number, grid: boolean): number {
  return grid ? Number(value.toFixed(SCALAR_DECIMAL_PLACES)) : value;
}

function isInverted({
  minValue,
  maxValue,
  windowMin,
  windowMax,
}: Range): boolean {
  return (
    (minValue !== undefined && maxValue !== undefined && minValue > maxValue) ||
    (windowMin !== undefined &&
      windowMax !== undefined &&
      windowMin > windowMax)
  );
}

function withRange(
  constraints: VariableConstraints,
  { minValue, maxValue, windowMin, windowMax }: Range,
): VariableConstraints {
  const window = constraints.dateWindow;

  return {
    ...constraints,
    ...(minValue !== undefined ? { minValue } : {}),
    ...(maxValue !== undefined ? { maxValue } : {}),
    ...(window !== undefined
      ? {
          dateWindow: {
            resolution: window.resolution,
            ...(windowMin !== undefined ? { min: windowMin } : {}),
            ...(windowMax !== undefined ? { max: windowMax } : {}),
          },
        }
      : {}),
  };
}

type PropagatedBounds = {
  /** Each group's rules, narrowed by every comparator that bounds it. */
  groups: Map<string, ConstrainedVariable>;
  /**
   * Groups propagation itself emptied: the comparators around them are what
   * their range could not hold. A group whose range was already empty when
   * propagation started is left out, because that is either one variable's own
   * bounds crossing or a group's members' bounds failing to overlap — both of
   * which the feasibility pass reports without propagating anything.
   */
  inverted: Set<string>;
};

/**
 * Every group's bounds narrowed by the whole system of comparators, rather than
 * by each comparison on its own.
 *
 * Folding a comparison into a bound one pair at a time cannot see a chain: `a`,
 * `b` and `c` each declared `[0, 1]` with `a < b < c` leaves every pair
 * satisfiable while the three together are not. Two walks over the group graph
 * settle the whole system at once:
 *
 * - forwards, in generation order, each edge raises its upper end's floor to
 *   the lower end's floor plus the step a strict comparison needs;
 * - backwards, in reverse, each edge lowers its lower end's ceiling by that
 *   same step below the upper end's ceiling.
 *
 * One walk each way is the fixpoint, not a first approximation. Floors are only
 * ever read from earlier groups and ceilings only from later ones, so neither
 * walk can invalidate what it has already settled, and the two never read each
 * other. That rests on generation order being a topological order of the
 * comparator graph, which `resolveGenerationOrder` guarantees whenever it
 * reports no cycles; an edge that contradicts the order therefore belongs to a
 * cycle it has already reported, and is dropped rather than looped over.
 *
 * A group whose bounds cross over keeps its own declared range: the feasibility
 * pass refuses such a protocol, and until it does the generator draws inside
 * the bounds a participant's form would enforce rather than outside them.
 */
export function propagateComparatorBounds(
  groups: Map<string, ConstrainedVariable>,
  order: readonly string[],
  edges: readonly ComparatorEdge[],
): PropagatedBounds {
  const position = new Map(order.map((group, index) => [group, index]));
  const at = (group: string): number => position.get(group) ?? 0;

  const ranges = new Map<string, Range>();
  const declaredInverted = new Set<string>();

  for (const [group, { constraints }] of groups) {
    const range: Range = {
      minValue: constraints.minValue,
      maxValue: constraints.maxValue,
      windowMin: constraints.dateWindow?.min,
      windowMax: constraints.dateWindow?.max,
    };
    ranges.set(group, range);
    if (isInverted(range)) declaredInverted.add(group);
  }

  const ordered = edges.filter(
    (edge) =>
      position.has(edge.lower) &&
      position.has(edge.upper) &&
      at(edge.lower) < at(edge.upper),
  );

  for (const edge of ordered.toSorted((a, b) => at(a.lower) - at(b.lower))) {
    const lower = groups.get(edge.lower);
    const upper = groups.get(edge.upper);
    const from = ranges.get(edge.lower);
    const into = ranges.get(edge.upper);
    if (!lower || !upper || !from || !into) continue;

    const span = comparatorSpan(lower, upper);
    const steps = edge.strict ? 1 : 0;

    if (span?.kind === 'numeric' && from.minValue !== undefined) {
      into.minValue = tighten(
        into.minValue,
        onGrid(from.minValue + steps * span.gap, span.gridUpper),
        true,
      );
    } else if (span?.kind === 'date' && from.windowMin !== undefined) {
      into.windowMin = tighten(
        into.windowMin,
        addSteps(from.windowMin, steps, span.resolution),
        true,
      );
    }
  }

  for (const edge of ordered.toSorted((a, b) => at(b.upper) - at(a.upper))) {
    const lower = groups.get(edge.lower);
    const upper = groups.get(edge.upper);
    const from = ranges.get(edge.upper);
    const into = ranges.get(edge.lower);
    if (!lower || !upper || !from || !into) continue;

    const span = comparatorSpan(lower, upper);
    const steps = edge.strict ? 1 : 0;

    if (span?.kind === 'numeric' && from.maxValue !== undefined) {
      into.maxValue = tighten(
        into.maxValue,
        onGrid(from.maxValue - steps * span.gap, span.gridLower),
        false,
      );
    } else if (span?.kind === 'date' && from.windowMax !== undefined) {
      into.windowMax = tighten(
        into.windowMax,
        addSteps(from.windowMax, -steps, span.resolution),
        false,
      );
    }
  }

  const propagated = new Map<string, ConstrainedVariable>();
  const inverted = new Set<string>();

  for (const [group, variable] of groups) {
    const range = ranges.get(group);

    if (range === undefined || isInverted(range)) {
      if (range !== undefined && !declaredInverted.has(group)) {
        inverted.add(group);
      }
      propagated.set(group, variable);
      continue;
    }

    propagated.set(group, {
      entry: variable.entry,
      constraints: withRange(variable.constraints, range),
    });
  }

  return { groups: propagated, inverted };
}
