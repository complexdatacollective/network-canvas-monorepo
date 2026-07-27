import type { StructuralCodebook } from '@codaco/protocol-validation';
import type { VariableValue } from '@codaco/shared-consts';

import type { VariableEntry } from '../../types';
import type { GenerationContext } from '../context';
import { addSteps } from './dateWindow';
import {
  type ComparatorEdge,
  KEY_SEPARATOR,
  resolveGenerationOrder,
} from './dependencyOrder';
import { type ConstraintConflict, SyntheticDataConstraintError } from './error';
import {
  comparatorGap,
  differentFromGroups,
  groupComparatorEdges,
  intersectGroupConstraints,
  propagateComparatorBounds,
  tighten,
} from './groupConstraints';
import {
  type SolvableComponent,
  solvableComponents,
  solveComponent,
  type TractableComponent,
} from './solver';
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

/** Which entity's constraints and unique-value registry a draw belongs to. */
export type EntityScopeRef =
  | { entity: 'ego' }
  | { entity: 'node' | 'edge'; type: string };

export function scopeKey(scope: EntityScopeRef): string {
  return scope.entity === 'ego' ? 'ego' : `${scope.entity}:${scope.type}`;
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
  { edges, membersOf, propagated }: Plan,
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

      // A value written at another resolution — or at none, being no date at
      // all — is in units these bounds are not: it does not compare against
      // them as a string, and a step measured here would be the wrong size for
      // it. `propagateComparatorBounds` leaves the same comparison alone.
      if (
        propagated.get(otherGroup)?.constraints.dateWindow?.resolution !==
        resolution
      ) {
        continue;
      }

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
  plan: Plan,
  resolved: Record<string, VariableValue>,
): Set<string> {
  const { membersOf, propagated, excluded } = plan;
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
      applyComparatorBounds(variable, other, plan, resolved),
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
 * The members of every group the registry issues values for, keyed by the slot
 * they are issued from. Callers that put a value on an entity without drawing
 * it — a roster row, a prompt's `additionalAttributes` — need this to say which
 * slot that value belongs to.
 */
export function uniqueSlotMembers(
  entity: EntityConstraints,
): Map<string, string[]> {
  const { membersOf } = resolveGenerationOrder(entity);
  const groups = intersectGroupConstraints(entity, membersOf);
  const slots = new Map<string, string[]>();

  for (const [group, memberIds] of membersOf) {
    if (groups.get(group)?.constraints.unique !== true) continue;
    slots.set(slotOf(memberIds), memberIds);
  }

  return slots;
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
  scope: EntityScopeRef,
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
    variables: entity,
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

  const componentOf = new Map<string, SolvableComponent>();
  for (const component of solvableComponents(
    propagated,
    order,
    edges,
    excluded,
  )) {
    for (const group of component.groups) componentOf.set(group, component);
  }
  const state: DrawState = { scope, index, resolved, only, existing };
  const solved = new Map<string, VariableValue>();
  const attempted = new Set<SolvableComponent>();

  for (const group of order) {
    const memberIds = membersOf.get(group) ?? [group];
    if (only && !memberIds.some((id) => only.has(id))) continue;

    const variable = plan.groups.get(group);
    if (variable === undefined) continue;

    // A whole component is settled at its first drawn group, so every value
    // is chosen in sight of every rule. Anything short of a solution — an
    // oversized component, an exhausted search, a genuinely unsatisfiable
    // set — leaves `solved` empty and the greedy path below drawing exactly
    // as it always has.
    const component = componentOf.get(group);
    if (component?.tractable !== undefined && !attempted.has(component)) {
      attempted.add(component);
      const assignment = solveTractableComponent(
        component.tractable,
        plan,
        ctx,
        state,
      );
      if (assignment !== undefined) {
        for (const [solvedGroup, value] of assignment) {
          solved.set(solvedGroup, value);
        }
      }
    }

    const value = drawGroup(
      plan,
      group,
      variable,
      ctx,
      state,
      solved.get(group),
    );

    for (const id of memberIds) {
      resolved[id] = value;
      if (!only || only.has(id)) produced[id] = value;
    }
  }

  return produced;
}

/**
 * One complete solve of a component for the entity being generated.
 *
 * Groups the entity keeps values for enter as pins; groups outside the run
 * with nothing held are dropped along with their constraints, which is what
 * the greedy path does with a rule whose counterpart never resolves. Free
 * groups' domains lose whatever a unique registry has already issued — their
 * own previous values are given back first, so a redraw may keep them — and
 * are searched in a seeded shuffle: the run stays reproducible for a seed
 * while entities land on different assignments.
 *
 * Returns the free groups' values, or undefined when the search found no
 * solution or ran out of budget — never a refusal, always a fallback.
 */
function solveTractableComponent(
  tractable: TractableComponent,
  plan: Plan,
  ctx: GenerationContext,
  { scope, resolved, only, existing }: DrawState,
): Map<string, VariableValue> | undefined {
  const registry = scopeKey(scope);
  const pins = new Map<string, VariableValue>();
  const exclude = new Set<string>();
  const free: string[] = [];

  for (const group of tractable.groups) {
    const memberIds = plan.membersOf.get(group) ?? [group];

    if (only && !memberIds.some((id) => only.has(id))) {
      const held = groupValue(memberIds, resolved);
      // A null counterpart never binds a comparator, and no drawn value can
      // collide with it, so dropping the group mirrors ignoring the rule.
      if (held === undefined || held === null) exclude.add(group);
      else pins.set(group, held);
      continue;
    }

    if (only && existing) {
      const keeper = memberIds.find(
        (id) => !only.has(id) && existing[id] !== undefined,
      );
      if (keeper !== undefined) {
        const held = existing[keeper];
        if (held === undefined || held === null) exclude.add(group);
        else pins.set(group, held);
        continue;
      }
    }

    free.push(group);
  }

  if (free.length === 0) return undefined;

  const uniqueSlots = new Map<string, string>();
  for (const group of free) {
    if (plan.groups.get(group)?.constraints.unique !== true) continue;
    const memberIds = plan.membersOf.get(group) ?? [group];
    uniqueSlots.set(group, slotOf(memberIds));

    // Released before the domains are read, so a solution that lands back on
    // the entity's own value reclaims it rather than being refused it. The
    // greedy fallback re-releases on failure, which the registry tolerates.
    if (existing !== undefined) {
      const previous = groupValue(memberIds, existing);
      if (previous !== undefined) {
        ctx.uniqueRegistry.release(registry, slotOf(memberIds), previous);
      }
    }
  }

  // One draw from the run's stream seeds a local shuffle, so the stream
  // advances by exactly one step per solve whatever the search does — a
  // capped or unsatisfiable solve cannot shift the draws that follow it, and
  // a domain's size never shows through as extra consumption.
  const shuffleSeed = ctx.valueGen.randomInt(0, 2 ** 31 - 1);

  const solveWith = (
    allowReserved: boolean,
  ): ReturnType<typeof solveComponent> => {
    const rand = mulberry32(shuffleSeed);
    return solveComponent(tractable, {
      pins,
      exclude,
      ...(uniqueSlots.size > 0
        ? {
            restrict: (group: string, value: VariableValue): boolean => {
              const slot = uniqueSlots.get(group);
              if (slot === undefined) return true;
              if (ctx.uniqueRegistry.isTaken(registry, slot, value)) {
                return false;
              }
              return (
                allowReserved ||
                !ctx.uniqueRegistry.isReserved(registry, slot, value)
              );
            },
          }
        : {}),
      // A unique group's slot is shared with every entity still to come, so
      // its values are consumed bottom-up the way the distinct-sequence draw
      // always consumed them: u over [0,1] and v over [1,2] with v > u must
      // allocate (0,1) before (1,2), where a shuffle could take (0,2) and
      // strand the next entity. Groups without a slot cost nothing across
      // entities and keep the shuffle that makes their data vary.
      orderDomain: (group, values) =>
        uniqueSlots.has(group) ? [...values] : shuffledBy(rand, values),
    });
  };

  // Values reserved for roster rows still to be drawn give way exactly as
  // they do on the greedy path: preferred against while anything else
  // satisfies the component, taken once nothing else does.
  let verdict = solveWith(false);
  if (verdict.kind !== 'sat' && uniqueSlots.size > 0) {
    verdict = solveWith(true);
  }

  if (verdict.kind !== 'sat') return undefined;

  const assignment = new Map<string, VariableValue>();
  for (const group of free) {
    const value = verdict.assignment.get(group);
    if (value !== undefined) assignment.set(group, value);
  }
  return assignment;
}

// The same generator the corpus harness uses; any small seeded PRNG works, as
// long as it is not the run's own faker stream.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates over a local seeded stream, so output is reproducible. */
function shuffledBy(
  rand: () => number,
  values: readonly VariableValue[],
): VariableValue[] {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const swap = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = swap;
  }
  return copy;
}

/** The entity's groups and the rules between them, resolved once. */
type Plan = {
  /** Every variable's own descriptor, before grouping merged any of them. */
  variables: EntityConstraints;
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
  scope: EntityScopeRef;
  index: number;
  resolved: Record<string, VariableValue>;
  only: Set<string> | undefined;
  existing: Record<string, VariableValue> | undefined;
};

/**
 * The rule names a group's members declare, so a refusal can say what was being
 * satisfied. `dateWindow` is reported as `parameters`, the protocol field a
 * date picker's bounds are configured in.
 */
function declaredRules(members: readonly ConstrainedVariable[]): string[] {
  const rules = new Set<string>();

  for (const { constraints } of members) {
    for (const [rule, value] of Object.entries(constraints)) {
      if (value === undefined || value === false) continue;
      rules.add(rule === 'dateWindow' ? 'parameters' : rule);
    }
  }

  return [...rules];
}

/**
 * The refusal a group left without a value raises. Feasibility analysis proves
 * impossible only what the declared bounds alone rule out, so a protocol it
 * accepted can still reach here — a `differentFrom` whose counterpart the
 * comparators pin to the one value left, say. Reported as the same error
 * carrying the same conflict shape, because whoever configured the protocol has
 * the same thing to look at either way.
 */
function exhaustedConflict(
  scope: EntityScopeRef,
  codebook: StructuralCodebook,
  members: readonly ConstrainedVariable[],
): ConstraintConflict {
  const definition =
    scope.entity === 'ego'
      ? undefined
      : scope.entity === 'node'
        ? codebook.node?.[scope.type]
        : codebook.edge?.[scope.type];

  return {
    entity: scope.entity,
    ...(scope.entity === 'ego' ? {} : { entityType: scope.type }),
    ...(definition?.name !== undefined
      ? { entityTypeName: definition.name }
      : {}),
    variableIds: members.map((member) => member.entry.id),
    variableNames: members.map((member) => member.entry.name),
    rules: declaredRules(members),
    reason:
      'no value satisfies these rules alongside the values chosen for the ' +
      'variables they refer to',
  };
}

function drawGroup(
  plan: Plan,
  group: string,
  variable: ConstrainedVariable,
  ctx: GenerationContext,
  { scope, index, resolved, only, existing }: DrawState,
  solved?: VariableValue,
): VariableValue {
  const { membersOf } = plan;
  const memberIds = membersOf.get(group) ?? [group];
  const { unique } = variable.constraints;
  const registry = scopeKey(scope);
  const slot = slotOf(memberIds);
  const claim = (value: VariableValue): VariableValue => {
    if (unique) ctx.uniqueRegistry.claim(registry, slot, value);
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

  // A value the component solve already chose. Its slot was released before
  // the solve read the registry, so claiming is all that is left to do.
  if (solved !== undefined) return claim(solved);

  // A group being redrawn over a value the entity already holds gives that
  // value's slot back first. Without it the entity would occupy two of the
  // slot's values while holding one, and a value space sized to the entity
  // count — which feasibility accepts — runs out partway through the run.
  // Released before the draw, not after, so a redraw that lands on the same
  // value reclaims it: the entity's one claim is never left at zero.
  if (unique && existing !== undefined) {
    const previous = groupValue(memberIds, existing);
    if (previous !== undefined) {
      ctx.uniqueRegistry.release(registry, slot, previous);
    }
  }

  const forbidden = forbiddenKeys(group, plan, resolved);

  const boundsOf = (source: ConstrainedVariable): ConstrainedVariable => ({
    entry: source.entry,
    constraints: withFallbackFloor(
      source.entry,
      applyComparatorBounds(source, group, plan, resolved),
    ),
  });

  const draw = (
    bounded: ConstrainedVariable,
    avoidReserved: boolean,
  ): { value: VariableValue } | undefined => {
    for (let attempt = 0; attempt < MAX_REDRAWS; attempt++) {
      // A redraw has to land somewhere else, so failed attempts walk the
      // distinct-value sequence; only the first draw is free to be random.
      const seq = unique
        ? ctx.uniqueRegistry.nextSeq(registry, slot)
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
        !(unique && ctx.uniqueRegistry.isTaken(registry, slot, value)) &&
        !(
          unique &&
          avoidReserved &&
          ctx.uniqueRegistry.isReserved(registry, slot, value)
        )
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
  const attempt = (
    avoidReserved: boolean,
  ): { value: VariableValue } | undefined =>
    draw(boundsOf(variable), avoidReserved) ??
    (unreserved === undefined
      ? undefined
      : draw(boundsOf(unreserved), avoidReserved));

  // Values reserved for roster rows still to be drawn are a precaution of the
  // same kind, and give way for the same reason: a row that is never drawn
  // holds nothing, so a value it reserved is better taken than refused.
  const drawn = attempt(true) ?? (unique ? attempt(false) : undefined);

  if (drawn === undefined) {
    const members: ConstrainedVariable[] = [];
    for (const id of memberIds) {
      const member = plan.variables.get(id);
      if (member !== undefined) members.push(member);
    }

    throw new SyntheticDataConstraintError(
      [exhaustedConflict(scope, ctx.codebook, members)],
      'this protocol declares validation rules that cannot all be satisfied together',
    );
  }

  return claim(drawn.value);
}
