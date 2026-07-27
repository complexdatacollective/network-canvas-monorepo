import type { VariableValue } from '@codaco/shared-consts';

import type { GenerationContext } from '../context';
import { addSteps } from './dateWindow';
import {
  canonicalComparatorEdges,
  type ComparatorEdge,
  resolveGenerationOrder,
} from './dependencyOrder';
import type {
  ConstrainedVariable,
  EntityConstraints,
  VariableConstraints,
} from './types';
import { valueKey } from './uniqueRegistry';
import { SCALAR_DECIMAL_PLACES } from './valueSpace';

type ComparisonDirection =
  | 'greater'
  | 'less'
  | 'greaterOrEqual'
  | 'lessOrEqual';

/**
 * How many redraws a `differentFrom` or `unique` variable gets before the run
 * is treated as internally inconsistent. Feasibility has already proven a
 * satisfying value exists, so exhausting this bound is a bug, not a protocol
 * problem.
 */
const MAX_REDRAWS = 1000;

// Variable ids never contain a NUL, so joining on one cannot collide.
const KEY_SEPARATOR = '\u0000';

/**
 * Keeps whichever of two bounds is tighter. Dates are compared as strings,
 * which orders them correctly as long as both are written at the same
 * resolution — every caller here checks that first.
 */
function tighten<T extends number | string>(
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
 * Narrows a group's own bounds so the groups drawn against it later still have
 * somewhere to go.
 *
 * `generateComparedTo` keeps a value inside its own bounds even when that
 * breaks the comparison, so a value drawn at the end of the range its dependent
 * has to step past strands that dependent on the bound: `a` and `b` both
 * `[0, 100]` with `b > a` fails whenever `a` draws 100. Reserving that step
 * here — one unit for a strict comparator, none for a non-strict one, whose
 * ends may touch — is what makes the comparison hold on every draw rather than
 * merely on most.
 *
 * The bound reserved against is the later group's, because that is what
 * `generateComparedTo` clamps to. Contradictory rules can invert the result;
 * the feasibility pass reports those, so this falls back to the declared bounds
 * rather than inventing a value outside them.
 */
function reserveComparatorHeadroom(
  constraints: VariableConstraints,
  group: string,
  edges: readonly ComparatorEdge[],
  position: Map<string, number>,
  groups: Map<string, ConstrainedVariable>,
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

    const other = groups.get(otherGroup);
    if (other === undefined) continue;
    const { entry, constraints: bounds } = other;

    if (entry.type === 'number' || entry.type === 'scalar') {
      const step = entry.type === 'scalar' ? 10 ** -SCALAR_DECIMAL_PLACES : 1;
      const reserved = edge.strict ? step : 0;

      if (groupIsLower && bounds.maxValue !== undefined) {
        maxValue = tighten(maxValue, bounds.maxValue - reserved, false);
      } else if (!groupIsLower && bounds.minValue !== undefined) {
        minValue = tighten(minValue, bounds.minValue + reserved, true);
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
    const reserved = edge.strict ? 1 : 0;

    if (groupIsLower && max !== undefined) {
      windowMax = tighten(
        windowMax,
        addSteps(max, -reserved, resolution),
        false,
      );
    } else if (!groupIsLower && min !== undefined) {
      windowMin = tighten(windowMin, addSteps(min, reserved, resolution), true);
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
 * Where the group sits relative to the first comparator counterpart that
 * already holds a value. Only one is applied, because `generateComparedTo`
 * places a value relative to a single target.
 */
function placement(
  group: string,
  edges: readonly ComparatorEdge[],
  membersOf: Map<string, string[]>,
  resolved: Record<string, VariableValue>,
): { target: VariableValue; direction: ComparisonDirection } | undefined {
  for (const edge of edges) {
    const groupIsUpper = edge.upper === group;
    if (!groupIsUpper && edge.lower !== group) continue;

    const otherGroup = groupIsUpper ? edge.lower : edge.upper;
    const target = groupValue(
      membersOf.get(otherGroup) ?? [otherGroup],
      resolved,
    );
    if (target === undefined || target === null) continue;

    const direction: ComparisonDirection = groupIsUpper
      ? edge.strict
        ? 'greater'
        : 'greaterOrEqual'
      : edge.strict
        ? 'less'
        : 'lessOrEqual';

    return { target, direction };
  }

  return undefined;
}

/** Comparison keys of every resolved value the group's value must not equal. */
function forbiddenKeys(
  members: readonly ConstrainedVariable[],
  group: string,
  groupOf: Map<string, string>,
  resolved: Record<string, VariableValue>,
): Set<string> {
  const keys = new Set<string>();

  for (const { constraints } of members) {
    const targetId = constraints.differentFrom;
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
  const position = new Map(order.map((group, at) => [group, at]));

  // Every group's rules are intersected before any group is drawn: reserving
  // headroom in one group reads the bounds of the group drawn against it.
  const groups = new Map<string, ConstrainedVariable>();
  const groupMembers = new Map<string, ConstrainedVariable[]>();
  for (const group of order) {
    const representative = entity.get(group);
    if (representative === undefined) continue;

    const members: ConstrainedVariable[] = [];
    for (const id of membersOf.get(group) ?? [group]) {
      const member = entity.get(id);
      if (member !== undefined) members.push(member);
    }

    groupMembers.set(group, members);
    groups.set(group, {
      entry: representative.entry,
      constraints: intersectConstraints(members, representative),
    });
  }

  for (const group of order) {
    const memberIds = membersOf.get(group) ?? [group];
    if (only && !memberIds.some((id) => only.has(id))) continue;

    const base = groups.get(group);
    const members = groupMembers.get(group);
    if (base === undefined || members === undefined) continue;

    const value = drawGroup(
      {
        groupOf,
        membersOf,
        group,
        memberIds,
        members,
        variable: {
          entry: base.entry,
          constraints: reserveComparatorHeadroom(
            base.constraints,
            group,
            edges,
            position,
            groups,
          ),
        },
        edges,
      },
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
  groupOf: Map<string, string>;
  membersOf: Map<string, string[]>;
  group: string;
  memberIds: readonly string[];
  members: readonly ConstrainedVariable[];
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
  { groupOf, membersOf, group, memberIds, members, variable, edges }: Group,
  ctx: GenerationContext,
  { scope, index, resolved, only, existing }: DrawState,
): VariableValue {
  // A member that is not being regenerated keeps the value it already holds,
  // and `sameAs` makes that the whole group's value — redrawing would leave the
  // entity holding two values the rule says are one.
  if (only && existing) {
    for (const id of memberIds) {
      const held = existing[id];
      if (!only.has(id) && held !== undefined) return held;
    }
  }

  const { unique } = variable.constraints;
  const slot = slotOf(memberIds);
  const claim = (value: VariableValue): VariableValue => {
    if (unique) ctx.uniqueRegistry.claim(scope, slot, value);
    return value;
  };

  const placed = placement(group, edges, membersOf, resolved);
  if (placed) {
    return claim(
      ctx.valueGen.generateComparedTo(
        variable,
        placed.target,
        placed.direction,
      ),
    );
  }

  const forbidden = forbiddenKeys(members, group, groupOf, resolved);
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
      variable,
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
