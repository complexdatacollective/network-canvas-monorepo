import type { VariableValue } from '@codaco/shared-consts';

import type { GenerationContext } from '../context';
import { addSteps } from './dateWindow';
import {
  canonicalComparatorEdges,
  type ComparatorEdge,
  KEY_SEPARATOR,
  resolveGenerationOrder,
} from './dependencyOrder';
import { intersectGroupConstraints, tighten } from './groupConstraints';
import type {
  ConstrainedVariable,
  EntityConstraints,
  VariableConstraints,
} from './types';
import { valueKey } from './uniqueRegistry';
import { SCALAR_DECIMAL_PLACES } from './valueSpace';

/**
 * How many redraws a `differentFrom` or `unique` variable gets before the run
 * is treated as internally inconsistent. Feasibility has already proven a
 * satisfying value exists, so exhausting this bound is a bug, not a protocol
 * problem.
 */
const MAX_REDRAWS = 1000;

/** The gap a strict comparator must leave, in the units the type is drawn in. */
function comparatorGap(type: 'number' | 'scalar'): number {
  return type === 'scalar' ? 10 ** -SCALAR_DECIMAL_PLACES : 1;
}

/**
 * Every comparator in the entity, rewritten as an ordering between the groups
 * that hold the two values. Both ends of an edge inside one group are the same
 * value, so nothing is left to order — a strict comparator of that shape is a
 * contradiction `resolveGenerationOrder` already reports.
 */
function groupComparatorEdges(
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

/**
 * How many of its own values each group has to be left, beyond the one a
 * comparator needs, for its `differentFrom` rules to have something to reject.
 *
 * A range narrowed to a single remaining value is emptied by one exclusion:
 * `b > a` with `a` at the top of its range leaves `b` exactly one value, which
 * `b differentFrom d` can then forbid. Counting the exclusions here lets
 * whatever `b` is drawn against reserve room for them as well.
 */
function exclusionCounts(
  entity: EntityConstraints,
  membersOf: Map<string, string[]>,
  groupOf: Map<string, string>,
): Map<string, number> {
  const counts = new Map<string, number>();

  for (const [group, memberIds] of membersOf) {
    const targets = new Set<string>();
    for (const id of memberIds) {
      const targetId = entity.get(id)?.constraints.differentFrom;
      if (targetId === undefined) continue;

      const targetGroup = groupOf.get(targetId);
      if (targetGroup === undefined || targetGroup === group) continue;
      targets.add(targetGroup);
    }
    counts.set(group, targets.size);
  }

  return counts;
}

/** What every group's reservation is computed against. */
type Headroom = {
  edges: readonly ComparatorEdge[];
  position: Map<string, number>;
  exclusions: Map<string, number>;
  /** Bounds of the groups reserved so far, which are the later ones. */
  reserved: Map<string, ConstrainedVariable>;
};

/**
 * Narrows a group's own bounds so the groups drawn against it later still have
 * somewhere to go.
 *
 * A value drawn at the end of the range its dependent has to step past strands
 * that dependent: `a` and `b` both `[0, 100]` with `b > a` leaves `b` nowhere
 * to go whenever `a` draws 100, because `b` may not escape its own bounds.
 * Reserving that step here — one for a strict comparator, none for a non-strict
 * one, whose ends may touch, plus one per exclusion the dependent has to make —
 * is what makes the rules hold on every draw rather than merely on most.
 *
 * The bound reserved against is the later group's, already carrying its own
 * reservations. Contradictory rules can invert the result; the feasibility pass
 * reports those, so this falls back to the declared bounds rather than
 * inventing a value outside them.
 */
function reserveComparatorHeadroom(
  constraints: VariableConstraints,
  group: string,
  { edges, position, exclusions, reserved }: Headroom,
): VariableConstraints {
  const window = constraints.dateWindow;
  let minValue = constraints.minValue;
  let maxValue = constraints.maxValue;
  let windowMin = window?.min;
  let windowMax = window?.max;

  const here = position.get(group);

  for (const edge of edges) {
    const groupIsLower = edge.lower === group;
    if (!groupIsLower && edge.upper !== group) continue;

    const otherGroup = groupIsLower ? edge.upper : edge.lower;
    const there = position.get(otherGroup);
    // A group drawn before this one is the target, not the dependent: it is
    // this draw that has to fit around it, which the comparison itself does.
    if (here === undefined || there === undefined || there <= here) continue;

    const other = reserved.get(otherGroup);
    if (other === undefined) continue;
    const { entry, constraints: bounds } = other;
    const steps = (edge.strict ? 1 : 0) + (exclusions.get(otherGroup) ?? 0);

    if (entry.type === 'number' || entry.type === 'scalar') {
      const room = steps * comparatorGap(entry.type);

      if (groupIsLower && bounds.maxValue !== undefined) {
        maxValue = tighten(maxValue, bounds.maxValue - room, false);
      } else if (!groupIsLower && bounds.minValue !== undefined) {
        minValue = tighten(minValue, bounds.minValue + room, true);
      }
      continue;
    }

    // At differing resolutions the reserved step would be the wrong size and
    // the two bounds would not compare as strings, so leave those alone.
    if (
      entry.type !== 'datetime' ||
      bounds.dateWindow === undefined ||
      window === undefined ||
      bounds.dateWindow.resolution !== window.resolution
    ) {
      continue;
    }

    const { resolution, min, max } = bounds.dateWindow;

    if (groupIsLower && max !== undefined) {
      windowMax = tighten(windowMax, addSteps(max, -steps, resolution), false);
    } else if (!groupIsLower && min !== undefined) {
      windowMin = tighten(windowMin, addSteps(min, steps, resolution), true);
    }
  }

  const inverted =
    (minValue !== undefined && maxValue !== undefined && minValue > maxValue) ||
    (windowMin !== undefined &&
      windowMax !== undefined &&
      windowMin > windowMax);
  if (inverted) return constraints;

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

/**
 * Every group's bounds, with room reserved for the groups drawn against them.
 *
 * Walked in reverse so each group reserves against bounds that already carry
 * their own reservations. In `a < b < c` the room `b` leaves for `c` narrows
 * `b`, and `a` then has to fit inside the narrowed `b` — reserving against
 * `b`'s declared bounds instead leaves `a` free to draw the one value `b` can
 * no longer step past. Reverse order is well-founded because a group only ever
 * reserves against groups strictly later than it.
 */
function reserveHeadroom(
  order: readonly string[],
  groups: Map<string, ConstrainedVariable>,
  edges: readonly ComparatorEdge[],
  exclusions: Map<string, number>,
): Map<string, ConstrainedVariable> {
  const position = new Map(order.map((group, at) => [group, at]));
  const reserved = new Map<string, ConstrainedVariable>();

  for (const group of order.toReversed()) {
    const base = groups.get(group);
    if (base === undefined) continue;

    reserved.set(group, {
      entry: base.entry,
      constraints: reserveComparatorHeadroom(base.constraints, group, {
        edges,
        position,
        exclusions,
        reserved,
      }),
    });
  }

  return reserved;
}

/** A group's shared value, from whichever member already carries one. */
function groupValue(
  memberIds: readonly string[],
  resolved: Record<string, VariableValue>,
): VariableValue | undefined {
  for (const id of memberIds) {
    const value = resolved[id];
    if (value !== undefined) return value;
  }
  return undefined;
}

/**
 * The group's bounds narrowed by every comparator whose counterpart already
 * holds a value.
 *
 * A comparator against a known value is a bound: `b > a` with `a = 54` puts
 * `b`'s floor at 55. Folding all of them in leaves one range that satisfies the
 * whole set at once, where placing the value relative to a single target
 * satisfies that one rule and silently drops the rest.
 */
function applyComparatorBounds(
  variable: ConstrainedVariable,
  group: string,
  edges: readonly ComparatorEdge[],
  membersOf: Map<string, string[]>,
  resolved: Record<string, VariableValue>,
): VariableConstraints {
  const { entry, constraints } = variable;

  // Only these three types accept a comparison rule (see the variable schema),
  // and only they carry a bound a comparison could narrow. Stepping any other
  // type leaves its domain — a boolean becomes 2, an ordinal a value no option
  // offers — so those draw against their own rules alone.
  if (
    entry.type !== 'number' &&
    entry.type !== 'scalar' &&
    entry.type !== 'datetime'
  ) {
    return constraints;
  }

  const window = constraints.dateWindow;
  const resolution = window?.resolution ?? 'full';
  let minValue = constraints.minValue;
  let maxValue = constraints.maxValue;
  let windowMin = window?.min;
  let windowMax = window?.max;

  for (const edge of edges) {
    const groupIsUpper = edge.upper === group;
    if (!groupIsUpper && edge.lower !== group) continue;

    const otherGroup = groupIsUpper ? edge.lower : edge.upper;
    const target = groupValue(
      membersOf.get(otherGroup) ?? [otherGroup],
      resolved,
    );
    if (target === undefined || target === null) continue;

    if (entry.type === 'datetime') {
      if (typeof target !== 'string' || target === '') continue;

      const steps = edge.strict ? 1 : 0;
      const bound = addSteps(target, groupIsUpper ? steps : -steps, resolution);
      if (groupIsUpper) windowMin = tighten(windowMin, bound, true);
      else windowMax = tighten(windowMax, bound, false);
      continue;
    }

    const numeric = Number(target);
    if (Number.isNaN(numeric)) continue;

    const gap = edge.strict ? comparatorGap(entry.type) : 0;
    const raw = groupIsUpper ? numeric + gap : numeric - gap;
    // Scalars are drawn on a fixed decimal grid, and adding the gap in binary
    // floating point lands just beside it; a bound off that grid is one every
    // draw would be clamped up to.
    const bound =
      entry.type === 'scalar'
        ? Number(raw.toFixed(SCALAR_DECIMAL_PLACES))
        : raw;

    if (groupIsUpper) minValue = tighten(minValue, bound, true);
    else maxValue = tighten(maxValue, bound, false);
  }

  if (entry.type === 'datetime') {
    return {
      ...constraints,
      dateWindow: {
        resolution,
        ...(windowMin !== undefined ? { min: windowMin } : {}),
        ...(windowMax !== undefined ? { max: windowMax } : {}),
      },
    };
  }

  return {
    ...constraints,
    ...(minValue !== undefined ? { minValue } : {}),
    ...(maxValue !== undefined ? { maxValue } : {}),
  };
}

/** Comparison keys of every resolved value the group's value must not equal. */
function forbiddenKeys(
  entity: EntityConstraints,
  memberIds: readonly string[],
  group: string,
  groupOf: Map<string, string>,
  resolved: Record<string, VariableValue>,
): Set<string> {
  const keys = new Set<string>();

  for (const id of memberIds) {
    const targetId = entity.get(id)?.constraints.differentFrom;
    if (targetId === undefined || groupOf.get(targetId) === group) continue;

    const target = resolved[targetId];
    if (target === undefined) continue;

    keys.add(valueKey(target));
  }

  return keys;
}

/**
 * The registry slot a group's `unique` values are issued from. Built from the
 * sorted member ids rather than the group's representative, whose identity
 * depends on the order the codebook's keys happen to be in.
 */
function slotOf(memberIds: readonly string[]): string {
  return memberIds.toSorted().join(KEY_SEPARATOR);
}

/**
 * Generates one entity's attributes in dependency order, so each variable is
 * drawn once every value it is defined against is known. Variables joined by
 * `sameAs` share a single value drawn against their combined rules.
 *
 * `existing` supplies values the entity already holds, which comparison and
 * `differentFrom` rules read but which are not re-emitted. `only` narrows what
 * is generated to a subset of the entity's variables.
 */
export function generateEntityAttributes(
  entity: EntityConstraints,
  ctx: GenerationContext,
  scope: string,
  index: number,
  options?: {
    existing?: Record<string, VariableValue>;
    only?: Set<string>;
  },
): Record<string, VariableValue> {
  const { order, membersOf, groupOf } = resolveGenerationOrder(entity);
  const only = options?.only;
  const existing = options?.existing;
  const resolved: Record<string, VariableValue> = { ...existing };
  const produced: Record<string, VariableValue> = {};

  const edges = groupComparatorEdges(entity, groupOf);

  // Every group's rules are intersected and reserved against before any group
  // is drawn: reserving headroom in one group reads the bounds of the group
  // drawn against it.
  const groups = reserveHeadroom(
    order,
    intersectGroupConstraints(entity, membersOf),
    edges,
    exclusionCounts(entity, membersOf, groupOf),
  );

  for (const group of order) {
    const memberIds = membersOf.get(group) ?? [group];
    if (only && !memberIds.some((id) => only.has(id))) continue;

    const variable = groups.get(group);
    if (variable === undefined) continue;

    const value = drawGroup(
      { entity, groupOf, membersOf, group, memberIds, variable, edges },
      ctx,
      { scope, index, resolved, only, existing },
    );

    for (const id of memberIds) {
      resolved[id] = value;
      if (!only || only.has(id)) produced[id] = value;
    }
  }

  return produced;
}

/** The group being drawn, resolved out of the entity once. */
type Group = {
  entity: EntityConstraints;
  groupOf: Map<string, string>;
  membersOf: Map<string, string[]>;
  group: string;
  memberIds: readonly string[];
  /** The group's combined rules, with comparator headroom already reserved. */
  variable: ConstrainedVariable;
  edges: readonly ComparatorEdge[];
};

/** What the run so far contributes to the draw. */
type DrawState = {
  scope: string;
  index: number;
  resolved: Record<string, VariableValue>;
  only: Set<string> | undefined;
  existing: Record<string, VariableValue> | undefined;
};

function drawGroup(
  { entity, groupOf, membersOf, group, memberIds, variable, edges }: Group,
  ctx: GenerationContext,
  { scope, index, resolved, only, existing }: DrawState,
): VariableValue {
  const { unique } = variable.constraints;
  const slot = slotOf(memberIds);
  const claim = (value: VariableValue): VariableValue => {
    if (unique) ctx.uniqueRegistry.claim(scope, slot, value);
    return value;
  };

  // A member that is not being regenerated keeps the value it already holds,
  // and `sameAs` makes that the whole group's value — redrawing would leave the
  // entity holding two values the rule says are one. It is claimed like a drawn
  // value, so a later entity cannot be issued it a second time.
  if (only && existing) {
    for (const id of memberIds) {
      const held = existing[id];
      if (!only.has(id) && held !== undefined) return claim(held);
    }
  }

  const bounded: ConstrainedVariable = {
    entry: variable.entry,
    constraints: applyComparatorBounds(
      variable,
      group,
      edges,
      membersOf,
      resolved,
    ),
  };

  const forbidden = forbiddenKeys(entity, memberIds, group, groupOf, resolved);
  let value: VariableValue = null;
  let satisfied = false;

  for (let attempt = 0; attempt < MAX_REDRAWS && !satisfied; attempt++) {
    // A redraw has to land somewhere else, so failed attempts walk the
    // distinct-value sequence; only the first draw is free to be random.
    const seq = unique
      ? ctx.uniqueRegistry.nextSeq(scope, slot)
      : attempt > 0
        ? attempt
        : undefined;

    value = ctx.valueGen.generateConstrained(
      bounded,
      index,
      seq !== undefined ? { distinctSeq: seq } : {},
    );
    satisfied =
      !forbidden.has(valueKey(value)) &&
      !(unique && ctx.uniqueRegistry.isTaken(scope, slot, value));
  }

  if (!satisfied) {
    throw new Error(
      `Could not draw a satisfying value for "${variable.entry.name}" after ${MAX_REDRAWS} attempts. ` +
        'Feasibility analysis should have rejected this protocol first; this is a bug in synthetic data generation.',
    );
  }

  return claim(value);
}
