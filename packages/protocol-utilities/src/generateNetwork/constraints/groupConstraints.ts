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
 * The rules the single value shared by a `sameAs` group must satisfy: the
 * tightest of every member's bounds rather than any one member's. A member
 * capped at `maxLength: 24` joined to one requiring `minLength: 24` needs a
 * value of exactly 24 characters, which neither member alone would produce.
 *
 * The representative supplies the type and options, since a `sameAs` between
 * variables of different types has no meaning the runtime could check.
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
      entry: representative.entry,
      constraints: intersectConstraints(members, representative),
    });
  }

  return groups;
}

/** The gap a strict comparator must leave, in the units the type is drawn in. */
export function comparatorGap(type: 'number' | 'scalar'): number {
  return type === 'scalar' ? 10 ** -SCALAR_DECIMAL_PLACES : 1;
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
 * How far apart a strict comparator holds its two ends, in the units the upper
 * end is drawn in: a whole number, one step of the scalar grid, or one unit at
 * the resolution both date windows share.
 */
type Span =
  | { kind: 'numeric'; gap: number; grid: boolean }
  | { kind: 'date'; resolution: DateResolution };

function isNumeric(variable: ConstrainedVariable): boolean {
  return variable.entry.type === 'number' || variable.entry.type === 'scalar';
}

/**
 * Comparisons the generator cannot step across — a number against a date, or
 * two dates written at different resolutions, whose bounds would not even
 * compare as strings — leave nothing to propagate.
 */
function comparatorSpan(
  lower: ConstrainedVariable,
  upper: ConstrainedVariable,
): Span | undefined {
  if (isNumeric(lower) && isNumeric(upper)) {
    const grid = upper.entry.type === 'scalar';
    return {
      kind: 'numeric',
      gap: comparatorGap(grid ? 'scalar' : 'number'),
      grid,
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
   * Groups propagation left with an empty range. Their own rules were
   * satisfiable in isolation; the comparators around them are not.
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
        onGrid(from.minValue + steps * span.gap, span.grid),
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
        onGrid(from.maxValue - steps * span.gap, span.grid),
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
