import type { VariableValue } from '@codaco/shared-consts';

import type { VariableEntry } from '../../types';
import type { GenerationContext } from '../context';
import { addSteps } from './dateWindow';
import {
  type ComparatorEdge,
  KEY_SEPARATOR,
  resolveGenerationOrder,
} from './dependencyOrder';
import {
  comparatorGap,
  groupComparatorEdges,
  intersectGroupConstraints,
  propagateComparatorBounds,
  tighten,
} from './groupConstraints';
import type {
  ConstrainedVariable,
  EntityConstraints,
  VariableConstraints,
} from './types';
import { valueKey } from './uniqueRegistry';
import { SCALAR_DECIMAL_PLACES } from './valueSpace';

/**
 * How many redraws a variable forbidden a value gets before the run is given
 * up on. Feasibility analysis refuses what the declared bounds alone prove
 * impossible; what can still exhaust this bound is a set of rules only the
 * values drawn along the way rule out.
 */
const MAX_REDRAWS = 1000;

/**
 * Which groups each group's value must differ from.
 *
 * `differentFrom` binds both of its ends, so the pair is recorded from both:
 * the ordering pass keeps one dependency edge per pair and drops it entirely
 * when it would close a cycle, which leaves the group that declared the rule as
 * likely to be drawn first as the group it names.
 */
function differentFromGroups(
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

function isNumeric(variable: ConstrainedVariable): boolean {
  return variable.entry.type === 'number' || variable.entry.type === 'scalar';
}

/** Whether two groups could ever hold the same value, judged by their bounds. */
function rangesCanIntersect(
  a: ConstrainedVariable,
  b: ConstrainedVariable,
): boolean {
  if (isNumeric(a) && isNumeric(b)) {
    const { minValue: aMin, maxValue: aMax } = a.constraints;
    const { minValue: bMin, maxValue: bMax } = b.constraints;
    return !(
      (aMin !== undefined && bMax !== undefined && aMin > bMax) ||
      (bMin !== undefined && aMax !== undefined && bMin > aMax)
    );
  }

  if (a.entry.type === 'datetime' && b.entry.type === 'datetime') {
    const aWindow = a.constraints.dateWindow;
    const bWindow = b.constraints.dateWindow;
    // Bounds at different resolutions do not compare as strings, so nothing
    // can be proven about them here.
    if (!aWindow || !bWindow || aWindow.resolution !== bWindow.resolution) {
      return true;
    }
    return !(
      (aWindow.min !== undefined &&
        bWindow.max !== undefined &&
        aWindow.min > bWindow.max) ||
      (bWindow.min !== undefined &&
        aWindow.max !== undefined &&
        bWindow.min > aWindow.max)
    );
  }

  return true;
}

/**
 * How many of its own values each group has to be left, beyond the one a
 * comparator needs, for the rules that forbid it a value to have something to
 * reject.
 *
 * A range narrowed to a single remaining value is emptied by one exclusion:
 * `b > a` with `a` at the top of its range leaves `b` exactly one value, which
 * `b differentFrom d` can then forbid. Counting the exclusions here lets
 * whatever `b` is drawn against reserve room for them as well. Each distinct
 * group takes at most one value, because `sameAs` has already collapsed the
 * ones that share a single value between them — and a group whose own bounds
 * cannot reach anything this one could draw takes none at all.
 */
function exclusionCounts(
  groups: Map<string, ConstrainedVariable>,
  excluded: Map<string, Set<string>>,
): Map<string, number> {
  const counts = new Map<string, number>();

  for (const [group, variable] of groups) {
    let count = 0;
    for (const other of excluded.get(group) ?? []) {
      const target = groups.get(other);
      if (target !== undefined && rangesCanIntersect(variable, target)) {
        count += 1;
      }
    }
    counts.set(group, count);
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
 * Narrows a group's ceiling so the group drawn against it later still has
 * somewhere to go.
 *
 * Propagation has already left room for the comparison itself. What it cannot
 * account for is how many of the dependent's remaining values the rules that
 * forbid it a value will take: `a` and `b` both `[0, 10]` with `b > a` and `b`
 * required to differ from a third variable needs `b` to keep two values, not
 * one, or that third variable can empty it. Only the ceiling is ever reserved,
 * because a comparator's lower end is always drawn first.
 *
 * Where the reservation would empty this group's own range it is taken as far
 * as the range allows instead of being abandoned: one reserved step of the two
 * a dependent wanted still leaves it better off, and a value outside this
 * group's own bounds is never worth trading for it.
 */
function reserveHeadroom(
  constraints: VariableConstraints,
  group: string,
  { edges, position, exclusions, reserved }: Headroom,
): VariableConstraints {
  const window = constraints.dateWindow;
  let maxValue = constraints.maxValue;
  let windowMax = window?.max;

  const here = position.get(group);

  for (const edge of edges) {
    if (edge.lower !== group) continue;

    const there = position.get(edge.upper);
    if (here === undefined || there === undefined || there <= here) continue;

    const other = reserved.get(edge.upper);
    if (other === undefined) continue;

    const steps = (edge.strict ? 1 : 0) + (exclusions.get(edge.upper) ?? 0);
    if (steps === 0) continue;

    const { entry, constraints: bounds } = other;

    if (entry.type === 'number' || entry.type === 'scalar') {
      if (bounds.maxValue === undefined) continue;
      const raw = bounds.maxValue - steps * comparatorGap(entry.type);
      maxValue = tighten(
        maxValue,
        entry.type === 'scalar'
          ? Number(raw.toFixed(SCALAR_DECIMAL_PLACES))
          : raw,
        false,
      );
      continue;
    }

    // At differing resolutions the reserved step would be the wrong size and
    // the two bounds would not compare as strings, so leave those alone.
    if (
      entry.type !== 'datetime' ||
      bounds.dateWindow?.max === undefined ||
      window === undefined ||
      bounds.dateWindow.resolution !== window.resolution
    ) {
      continue;
    }

    windowMax = tighten(
      windowMax,
      addSteps(bounds.dateWindow.max, -steps, window.resolution),
      false,
    );
  }

  if (
    constraints.minValue !== undefined &&
    maxValue !== undefined &&
    maxValue < constraints.minValue
  ) {
    maxValue = constraints.minValue;
  }
  if (
    window?.min !== undefined &&
    windowMax !== undefined &&
    windowMax < window.min
  ) {
    windowMax = window.min;
  }

  return {
    ...constraints,
    ...(maxValue !== undefined ? { maxValue } : {}),
    ...(window !== undefined
      ? {
          dateWindow: {
            resolution: window.resolution,
            ...(window.min !== undefined ? { min: window.min } : {}),
            ...(windowMax !== undefined ? { max: windowMax } : {}),
          },
        }
      : {}),
  };
}

/**
 * Every group's propagated bounds, with room reserved for the exclusions the
 * groups drawn against them have to make.
 *
 * Walked in reverse so each group reserves against bounds that already carry
 * their own reservations. In `a < b < c` the room `b` leaves for `c` narrows
 * `b`, and `a` then has to fit inside the narrowed `b` — reserving against
 * `b`'s propagated bounds instead would leave `a` free to draw the one value
 * `b` can no longer step past. Reverse order is well-founded because a group
 * only ever reserves against groups strictly later than it.
 */
function reserveExclusionHeadroom(
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
      constraints: reserveHeadroom(base.constraints, group, {
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
 *
 * A comparison against a value the group's own bounds cannot reach folds into a
 * range with nothing in it. Its own bounds win then, and the crossed bound is
 * pulled back only as far as they allow — as close to satisfying the comparison
 * as the group can get. A value outside its own bounds fails the hard validator
 * a participant's form applies, where a broken comparison fails a cross-variable
 * one and still leaves a form that can be seen.
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
    if (window?.max !== undefined && windowMin !== undefined) {
      windowMin = windowMin > window.max ? window.max : windowMin;
    }
    if (window?.min !== undefined && windowMax !== undefined) {
      windowMax = windowMax < window.min ? window.min : windowMax;
    }
    if (
      windowMin !== undefined &&
      windowMax !== undefined &&
      windowMin > windowMax
    ) {
      windowMin = windowMax;
    }

    return {
      ...constraints,
      dateWindow: {
        resolution,
        ...(windowMin !== undefined ? { min: windowMin } : {}),
        ...(windowMax !== undefined ? { max: windowMax } : {}),
      },
    };
  }

  if (constraints.maxValue !== undefined && minValue !== undefined) {
    minValue = Math.min(minValue, constraints.maxValue);
  }
  if (constraints.minValue !== undefined && maxValue !== undefined) {
    maxValue = Math.max(maxValue, constraints.minValue);
  }
  if (minValue !== undefined && maxValue !== undefined && minValue > maxValue) {
    minValue = maxValue;
  }

  return {
    ...constraints,
    ...(minValue !== undefined ? { minValue } : {}),
    ...(maxValue !== undefined ? { maxValue } : {}),
  };
}

/**
 * The range `ValueGenerator` falls back to when a number variable leaves a side
 * open, mirrored here. A realistic default is only usable while it fits under
 * what is known: a variable that declares no bounds of its own but is required
 * to stay below a value of 10 has a ceiling of 9 and no floor at all, and the
 * generator's own floor of 18 would put every draw above that ceiling.
 *
 * Only `number` needs this. A scalar carries the normalised scale as its bounds
 * from the moment its constraints are built, so it never reaches a draw with a
 * side left open.
 */
const NUMBER_OPEN_RANGE = { floor: 18, span: 62 };

/** A floor for a group given a ceiling but left without one. */
function withFallbackFloor(
  entry: VariableEntry,
  constraints: VariableConstraints,
): VariableConstraints {
  if (entry.type !== 'number') return constraints;

  const { minValue, maxValue } = constraints;
  if (
    minValue !== undefined ||
    maxValue === undefined ||
    maxValue >= NUMBER_OPEN_RANGE.floor
  ) {
    return constraints;
  }

  return { ...constraints, minValue: maxValue - NUMBER_OPEN_RANGE.span };
}

/**
 * The one value a group's rules leave it, when they leave exactly one. Only the
 * types a comparator narrows are considered: for the rest a range of one is
 * either unreachable or not something a bound describes.
 */
function soleValue(
  entry: VariableEntry,
  constraints: VariableConstraints,
): VariableValue | undefined {
  if (entry.type === 'datetime') {
    const window = constraints.dateWindow;
    if (window?.min !== undefined && window.min === window.max) {
      return window.min;
    }
    return undefined;
  }

  const { minValue, maxValue } = constraints;
  if (minValue === undefined || maxValue === undefined) return undefined;
  if (entry.type === 'scalar') {
    return minValue === maxValue ? minValue : undefined;
  }
  if (entry.type !== 'number') return undefined;

  // Numbers are drawn whole wherever the range holds a whole value.
  const floor = Math.ceil(minValue);
  return floor === Math.floor(maxValue) ? floor : undefined;
}

/**
 * Comparison keys of every value this group's value must not equal.
 *
 * Both ends of a `differentFrom` are read rather than only the declaring one:
 * the ordering pass drops the edge that would close a cycle, and the declaring
 * group is then drawn first, where its own rule has nothing resolved to point
 * at. Whichever end is drawn second is the one that avoids the other's value.
 *
 * A counterpart still to be drawn contributes too, when the rules have narrowed
 * it to a single value: taking that value here would leave it nothing at all,
 * and no redraw of its own could recover it.
 *
 * That single value is read from the counterpart's propagated bounds rather
 * than its reserved ones. The reservation has already subtracted the steps its
 * own dependents might need, which is a precaution and not a limit, so a
 * counterpart that looks pinned after it can still have values to draw and
 * forbidding one would take away a value that was genuinely available. What
 * this guarantees is therefore narrow: a counterpart the comparators alone pin
 * to one value keeps it. One left two or more values can still be emptied by
 * the draws around it, which is what the reservation is for.
 */
function forbiddenKeys(
  group: string,
  { membersOf, edges, propagated, excluded }: Plan,
  resolved: Record<string, VariableValue>,
): Set<string> {
  const keys = new Set<string>();

  for (const other of excluded.get(group) ?? []) {
    const held = groupValue(membersOf.get(other) ?? [other], resolved);
    if (held !== undefined) {
      keys.add(valueKey(held));
      continue;
    }

    const variable = propagated.get(other);
    if (variable === undefined) continue;

    const sole = soleValue(
      variable.entry,
      applyComparatorBounds(variable, other, edges, membersOf, resolved),
    );
    if (sole !== undefined) keys.add(valueKey(sole));
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
  const excluded = differentFromGroups(entity, groupOf);

  // Every group's rules are settled before any group is drawn: propagation
  // reads the bounds on both sides of each comparator, and the headroom
  // reserved in one group is read from the group drawn against it.
  const { groups: propagated } = propagateComparatorBounds(
    intersectGroupConstraints(entity, membersOf),
    order,
    edges,
  );
  const plan: Plan = {
    membersOf,
    edges,
    groups: reserveExclusionHeadroom(
      order,
      propagated,
      edges,
      exclusionCounts(propagated, excluded),
    ),
    propagated,
    excluded,
  };

  for (const group of order) {
    const memberIds = membersOf.get(group) ?? [group];
    if (only && !memberIds.some((id) => only.has(id))) continue;

    const variable = plan.groups.get(group);
    if (variable === undefined) continue;

    const value = drawGroup(plan, group, variable, ctx, {
      scope,
      index,
      resolved,
      only,
      existing,
    });

    for (const id of memberIds) {
      resolved[id] = value;
      if (!only || only.has(id)) produced[id] = value;
    }
  }

  return produced;
}

/** The entity's groups and the rules between them, resolved once. */
type Plan = {
  membersOf: Map<string, string[]>;
  edges: readonly ComparatorEdge[];
  /**
   * Each group's combined rules, propagated and with headroom reserved. What
   * every group is drawn against.
   */
  groups: Map<string, ConstrainedVariable>;
  /**
   * The same rules before the reservation narrowed them, which is every value
   * the comparators leave a group rather than the ones left after room was held
   * back for its dependents. Read wherever a group has to be judged genuinely
   * out of values rather than merely narrow.
   */
  propagated: Map<string, ConstrainedVariable>;
  /** Which groups each group's value must differ from. */
  excluded: Map<string, Set<string>>;
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
  plan: Plan,
  group: string,
  variable: ConstrainedVariable,
  ctx: GenerationContext,
  { scope, index, resolved, only, existing }: DrawState,
): VariableValue {
  const { membersOf, edges } = plan;
  const memberIds = membersOf.get(group) ?? [group];
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

  // A group being redrawn over a value the entity already holds gives that
  // value's slot back first. Without it the entity would occupy two of the
  // slot's values while holding one, and a value space sized to the entity
  // count — which feasibility accepts — runs out partway through the run.
  // Released before the draw, not after, so a redraw that lands on the same
  // value reclaims it: the entity's one claim is never left at zero.
  if (unique && existing !== undefined) {
    const previous = groupValue(memberIds, existing);
    if (previous !== undefined) {
      ctx.uniqueRegistry.release(scope, slot, previous);
    }
  }

  const forbidden = forbiddenKeys(group, plan, resolved);

  const boundsOf = (source: ConstrainedVariable): ConstrainedVariable => ({
    entry: source.entry,
    constraints: withFallbackFloor(
      source.entry,
      applyComparatorBounds(source, group, edges, membersOf, resolved),
    ),
  });

  const draw = (
    bounded: ConstrainedVariable,
  ): { value: VariableValue } | undefined => {
    for (let attempt = 0; attempt < MAX_REDRAWS; attempt++) {
      // A redraw has to land somewhere else, so failed attempts walk the
      // distinct-value sequence; only the first draw is free to be random.
      const seq = unique
        ? ctx.uniqueRegistry.nextSeq(scope, slot)
        : attempt > 0
          ? attempt
          : undefined;

      const value = ctx.valueGen.generateConstrained(
        bounded,
        index,
        seq !== undefined ? { distinctSeq: seq } : {},
      );
      if (
        !forbidden.has(valueKey(value)) &&
        !(unique && ctx.uniqueRegistry.isTaken(scope, slot, value))
      ) {
        return { value };
      }
    }

    return undefined;
  };

  // Room held back for the groups drawn against this one is a precaution, not a
  // bound the protocol declares. Where honouring it leaves nothing to draw, the
  // group's own propagated bounds are tried instead — a value inside those
  // still satisfies every rule this group carries, and the alternative is
  // giving up on a value that was available all along. Only a draw that has
  // already failed reaches here, so nothing that succeeds is drawn differently.
  const unreserved = plan.propagated.get(group);
  const drawn =
    draw(boundsOf(variable)) ??
    (unreserved === undefined ? undefined : draw(boundsOf(unreserved)));

  if (drawn === undefined) {
    throw new Error(
      `Could not draw a satisfying value for "${variable.entry.name}" after ${MAX_REDRAWS} attempts. ` +
        'No value satisfies its own rules alongside the values already drawn for the variables it ' +
        'references. Feasibility analysis refuses what the declared bounds alone prove impossible, ' +
        'which is not every combination that can end up here.',
    );
  }

  return claim(drawn.value);
}
