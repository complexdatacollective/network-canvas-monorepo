import type { VariableValue } from '@codaco/shared-consts';

import { addSteps, stepsBetween } from './dateWindow.ts';
import type { ComparatorEdge } from './dependencyOrder.ts';
import { comparatorSpan, type Span } from './groupConstraints.ts';
import {
  MAX_COMPONENT_VARIABLES,
  MAX_DOMAIN_ELEMENTS,
  MAX_DOMAIN_PRODUCT,
  MAX_SEARCH_NODES,
} from './solverLimits.ts';
import type { ConstrainedVariable } from './types.ts';
import { valueKey } from './uniqueRegistry.ts';
import {
  booleanDomainValues,
  type DecimalGrid,
  decimalGrid,
  decimalGridValueAt,
  distinctOptionValues,
  scalarDrawGrid,
  selectionSizeRange,
} from './valueSpace.ts';

/**
 * One connected web of cross-variable rules, ready for complete search: every
 * group's finite domain, and the comparator and `differentFrom` constraints
 * between them. Exhausting these domains without a solution is a proof that no
 * assignment satisfies the component.
 */
export type TractableComponent = {
  /** Group representative ids, in generation order. */
  groups: string[];
  /** Every value the generator can produce for each group, in a fixed order. */
  domains: Map<string, VariableValue[]>;
  comparators: {
    lower: string;
    upper: string;
    strict: boolean;
    span: Span;
  }[];
  different: [string, string][];
};

export type SolvableComponent = {
  /** Group representative ids, in generation order. */
  groups: string[];
  /**
   * Present only when every domain is enumerable within the solver limits.
   * An absent value means the component must take the greedy draw path — it is
   * never a verdict about satisfiability.
   */
  tractable?: TractableComponent;
};

export type SolveOptions = {
  /** Values some groups already hold; solved values must fit around them. */
  pins?: ReadonlyMap<string, VariableValue>;
  /** Groups to leave out entirely, along with every constraint touching them. */
  exclude?: ReadonlySet<string>;
  /** Per-value filter, e.g. values a unique registry has already issued. */
  restrict?: (group: string, value: VariableValue) => boolean;
  /**
   * Search order for each group's values. Generation passes a seeded shuffle
   * so entities vary; feasibility leaves the enumeration order, which makes
   * its verdict a pure function of the protocol.
   */
  orderDomain?: (
    group: string,
    values: readonly VariableValue[],
  ) => VariableValue[];
  maxNodes?: number;
};

export type SolveVerdict =
  | { kind: 'sat'; assignment: Map<string, VariableValue> }
  | { kind: 'unsat' }
  | { kind: 'unknown' };

function integerRange(lo: number, hi: number): number[] {
  const values: number[] = [];
  for (let value = lo; value <= hi; value++) values.push(value);
  return values;
}

// Kept in sync with valueSpace's own binomial; both cap their sums long
// before float imprecision could matter.
function binomial(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 0; i < k; i++) {
    result = (result * (n - i)) / (i + 1);
  }
  return Math.round(result);
}

/**
 * The selection sizes a solved categorical value may take: the draw's own
 * size range, with the ceiling clamped up to the floor the way the draw
 * clamps its count — a `minSelected` above the default cap of two still
 * produces selections of exactly that size, never nothing.
 */
function subsetSizes(variable: ConstrainedVariable): {
  min: number;
  max: number;
} {
  const { min, max } = selectionSizeRange(variable);
  return { min, max: Math.max(min, max) };
}

/**
 * Option values with duplicates dropped, first occurrence kept. An imported
 * protocol may list one value under two labels; the draw deduplicates every
 * selection it emits, so a position-based enumeration over the raw list
 * would fabricate multiset selections like `['x','x']` that no draw and no
 * participant control can produce.
 */
/**
 * Option subsets whose sizes fall inside the selection bounds, smallest sizes
 * first and lexicographic by option position within a size. Undefined once the
 * count passes `cap` — combinatorial domains routinely explode, and an
 * oversized domain is a fallback, not an error.
 */
function enumerateSubsets(
  options: readonly (string | number | boolean)[],
  minSelected: number,
  maxSelected: number,
  cap: number,
): VariableValue[] | undefined {
  const subsets: VariableValue[] = [];
  const picked: (string | number | boolean)[] = [];

  const walk = (start: number, remaining: number): boolean => {
    if (remaining === 0) {
      if (subsets.length >= cap) return false;
      subsets.push([...picked]);
      return true;
    }
    for (let i = start; i <= options.length - remaining; i++) {
      picked.push(options[i]!);
      const kept = walk(i + 1, remaining - 1);
      picked.pop();
      if (!kept) return false;
    }
    return true;
  };

  for (let size = minSelected; size <= maxSelected; size++) {
    if (!walk(0, size)) return undefined;
  }
  return subsets;
}

/**
 * The values a decimal grid holds, ascending, or undefined past `cap` — the
 * same set `valueSpaceSize` counts and the draw walks, in the same order.
 *
 * An inverted or single-point range collapses to its floor, and a range whose
 * ends the protocol left off the grid keeps them, since the draw's clamp
 * reaches them. Both readers of a grid below go through this, so a scalar and a
 * number whose range holds no integer are enumerated by one piece of code, as
 * they are drawn by one.
 */
function gridValues(
  grid: DecimalGrid,
  cap: number,
): VariableValue[] | undefined {
  if (grid.size > cap) return undefined;
  return Array.from({ length: grid.size }, (_value, index) =>
    decimalGridValueAt(grid, index),
  );
}

/** A domain's value count, and how many elements those values hold in total. */
type DomainSize = { count: number; elements: number };

/**
 * How many values {@link enumerateDomain} would return — and how many
 * elements they carry once built, since a categorical selection of eight
 * options costs eight — without building any of them. Kept branch-for-branch
 * with the enumeration (the pair is guarded by a test asserting the counts
 * agree with `valueSpaceSize`), so tractability can be judged before a single
 * value is materialised: a wide categorical used to allocate its whole subset
 * budget per entity merely to learn the component was oversized.
 */
function domainSize(
  variable: ConstrainedVariable,
  cap: number,
): DomainSize | undefined {
  const { entry, constraints } = variable;

  const flat = (count: number): DomainSize | undefined =>
    count > cap ? undefined : { count, elements: count };

  switch (entry.type) {
    case 'boolean':
      return flat(booleanDomainValues(entry).length);

    case 'ordinal': {
      const count = distinctOptionValues(entry).length;
      return count === 0 ? undefined : flat(count);
    }

    case 'number': {
      const { minValue, maxValue } = constraints;
      if (minValue === undefined || maxValue === undefined) return undefined;
      if (maxValue < minValue) return flat(0);
      const lo = Math.ceil(minValue);
      const hi = Math.floor(maxValue);
      // A range holding no whole value is drawn on the decimal grid instead,
      // and is counted on it here — the same fork `valueSpaceSize` takes.
      if (hi < lo) return flat(decimalGrid(minValue, maxValue).size);
      return flat(hi - lo + 1);
    }

    case 'scalar':
      return flat(scalarDrawGrid(constraints).size);

    case 'datetime': {
      const window = constraints.dateWindow;
      if (window?.min === undefined || window.max === undefined) {
        return undefined;
      }
      const steps = stepsBetween(window.min, window.max, window.resolution);
      if (steps < 0) return flat(0);
      return flat(steps + 1);
    }

    case 'categorical': {
      const optionCount = distinctOptionValues(entry).length;
      if (optionCount === 0) return undefined;
      const { min, max } = subsetSizes(variable);
      let count = 0;
      let elements = 0;
      for (let size = min; size <= max; size++) {
        const subsets = binomial(optionCount, size);
        count += subsets;
        elements += subsets * size;
        if (count > cap || elements > MAX_DOMAIN_ELEMENTS) return undefined;
      }
      return { count, elements };
    }

    default:
      return undefined;
  }
}

/**
 * Every value the generator can produce for this group, or undefined where the
 * set is unbounded, larger than `cap`, or deliberately left to the greedy path.
 *
 * A number is enumerated the way it is drawn, which is one way or the other and
 * never both: whole values wherever its range holds one, and the decimal grid a
 * scalar is drawn on where it holds none. Both come from the descriptors the
 * draw and `valueSpaceSize` read, so a component mixing an integer-bounded
 * variable with a fractional one enumerates each by its own draw's values.
 *
 * That fractional half was declined here for a while, on the reasoning that
 * declining only ever sends a component to the greedy path while admitting one
 * puts a fresh `unsat` proof behind it. What made admitting it safe is that the
 * proof is now taken over exactly the values the greedy path can reach: the
 * numeric search compares the domain values themselves, so a component it
 * exhausts is one whose whole drawable space was covered — and a `[0.001,
 * 0.009]` chain it refuses is one whose two reachable ends the draw would have
 * clamped into breaking the comparison rather than satisfying it.
 *
 * A comparison between dates at different resolutions is still left to the
 * greedy path, for a reason of its own: this search compares date domains as
 * strings — see {@link tractableOf}.
 */
function enumerateDomain(
  variable: ConstrainedVariable,
  cap: number,
): VariableValue[] | undefined {
  const { entry, constraints } = variable;

  switch (entry.type) {
    case 'boolean':
      return booleanDomainValues(entry);

    case 'ordinal': {
      const values = distinctOptionValues(entry);
      if (values.length === 0 || values.length > cap) return undefined;
      return values;
    }

    case 'number': {
      const { minValue, maxValue } = constraints;
      if (minValue === undefined || maxValue === undefined) return undefined;
      if (maxValue < minValue) return [];
      const lo = Math.ceil(minValue);
      const hi = Math.floor(maxValue);
      // Narrower than one unit, so the grid holds at most
      // `10 ** SCALAR_DECIMAL_PLACES + 1` values and the cap rarely binds — it
      // is still spent, through the same helper the scalar domain is capped by.
      if (hi < lo) return gridValues(decimalGrid(minValue, maxValue), cap);
      if (hi - lo + 1 > cap) return undefined;
      return integerRange(lo, hi);
    }

    case 'scalar':
      return gridValues(scalarDrawGrid(constraints), cap);

    case 'datetime': {
      const window = constraints.dateWindow;
      if (window?.min === undefined || window.max === undefined) {
        return undefined;
      }
      const steps = stepsBetween(window.min, window.max, window.resolution);
      if (steps < 0) return [];
      if (steps + 1 > cap) return undefined;
      const values: VariableValue[] = [];
      for (let step = 0; step <= steps; step++) {
        values.push(addSteps(window.min, step, window.resolution));
      }
      return values;
    }

    case 'categorical': {
      const options = distinctOptionValues(entry);
      if (options.length === 0) return undefined;
      const { min, max } = subsetSizes(variable);
      return enumerateSubsets(options, min, max, cap);
    }

    // text is effectively unbounded, and layout/location accept no
    // cross-variable rules; none of them is ever solved.
    case 'text':
    case 'layout':
    case 'location':
      return undefined;

    default:
      return undefined;
  }
}

type ComponentPieces = {
  groups: string[];
  edges: ComparatorEdge[];
  different: [string, string][];
};

/**
 * The webs of groups joined by comparator or `differentFrom` constraints, and
 * for each the finite domains a complete search needs — where those exist
 * within the solver limits.
 *
 * Domains are enumerated from the **propagated** bounds, so the search starts
 * from everything interval propagation could already conclude. Groups with no
 * cross-variable constraint belong to no component; they draw exactly as they
 * always have.
 */
export function solvableComponents(
  groups: Map<string, ConstrainedVariable>,
  order: readonly string[],
  edges: readonly ComparatorEdge[],
  excluded: Map<string, Set<string>>,
): SolvableComponent[] {
  const adjacency = new Map<string, Set<string>>();
  const link = (from: string, to: string): void => {
    const neighbours = adjacency.get(from) ?? new Set<string>();
    neighbours.add(to);
    adjacency.set(from, neighbours);
  };

  for (const edge of edges) {
    if (!groups.has(edge.lower) || !groups.has(edge.upper)) continue;
    link(edge.lower, edge.upper);
    link(edge.upper, edge.lower);
  }
  for (const [group, targets] of excluded) {
    for (const target of targets) {
      if (!groups.has(group) || !groups.has(target)) continue;
      link(group, target);
      link(target, group);
    }
  }

  const position = new Map(order.map((group, index) => [group, index]));
  const at = (group: string): number => position.get(group) ?? 0;

  const seen = new Set<string>();
  const pieces: ComponentPieces[] = [];

  for (const start of order) {
    if (!adjacency.has(start) || seen.has(start)) continue;
    seen.add(start);

    const members: string[] = [];
    const pending = [start];
    while (pending.length > 0) {
      const group = pending.pop();
      if (group === undefined) break;
      members.push(group);
      for (const next of adjacency.get(group) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        pending.push(next);
      }
    }
    members.sort((a, b) => at(a) - at(b));

    const inComponent = new Set(members);
    const componentEdges = edges.filter(
      (edge) => inComponent.has(edge.lower) && inComponent.has(edge.upper),
    );
    const different: [string, string][] = [];
    for (const group of members) {
      for (const target of excluded.get(group) ?? []) {
        if (!inComponent.has(target) || at(target) <= at(group)) continue;
        different.push([group, target]);
      }
    }

    pieces.push({ groups: members, edges: componentEdges, different });
  }

  return pieces.map((piece) => {
    const tractable = tractableOf(piece, groups);
    return { groups: piece.groups, ...(tractable ? { tractable } : {}) };
  });
}

function tractableOf(
  piece: ComponentPieces,
  groups: Map<string, ConstrainedVariable>,
): TractableComponent | undefined {
  if (piece.groups.length > MAX_COMPONENT_VARIABLES) return undefined;

  const comparators: TractableComponent['comparators'] = [];
  for (const edge of piece.edges) {
    const lower = groups.get(edge.lower);
    const upper = groups.get(edge.upper);
    if (lower === undefined || upper === undefined) return undefined;
    const span = comparatorSpan(lower, upper);
    // An incomparable pair — a number against a date, or either end carrying
    // no window — is a rule the greedy path ignores; a complete search cannot
    // claim to decide a component containing one.
    if (span === undefined) return undefined;
    // Two dates at different resolutions do compare, as instants: the runtime
    // reads a date-only string as the start of the period it names. But the
    // search below compares domain strings lexically, where '2026-12-01'
    // outranks the '2026-12' it is actually equal to, so a strict comparator
    // would read as satisfied by a pair that violates it. Propagation writes
    // each bound in the units of the end it constrains and gets this right;
    // this search does not, so those components go to the greedy path.
    if (span.kind === 'date' && span.lower !== span.upper) return undefined;
    comparators.push({ ...edge, span });
  }

  // Sizes are judged before anything is materialised: an oversized component
  // must cost a closed-form count per entity, not a mountain of discarded
  // arrays. The element total is bounded alongside the product, because a
  // combination-heavy categorical can hold a modest number of wide subsets
  // whose materialisation and per-solve scans are what actually cost.
  let product = 1;
  let elements = 0;
  for (const group of piece.groups) {
    const variable = groups.get(group);
    if (variable === undefined) return undefined;
    const size = domainSize(variable, MAX_DOMAIN_PRODUCT);
    if (size === undefined) return undefined;
    product *= Math.max(1, size.count);
    elements += size.elements;
    if (product > MAX_DOMAIN_PRODUCT || elements > MAX_DOMAIN_ELEMENTS) {
      return undefined;
    }
  }

  const domains = new Map<string, VariableValue[]>();
  for (const group of piece.groups) {
    const variable = groups.get(group);
    if (variable === undefined) return undefined;
    const domain = enumerateDomain(variable, MAX_DOMAIN_PRODUCT);
    if (domain === undefined) return undefined;
    domains.set(group, domain);
  }

  return {
    groups: piece.groups,
    domains,
    comparators,
    different: piece.different,
  };
}

/** Search state for one group: its remaining values and their compare keys. */
type Cell = {
  values: VariableValue[];
  keys: string[];
};

function satisfiesComparator(
  lowerValue: VariableValue,
  upperValue: VariableValue,
  strict: boolean,
  span: Span,
): boolean {
  if (span.kind === 'date') {
    // Date domains hold resolution strings; a pin of any other shape cannot
    // satisfy the comparison, which sends the component to the greedy path.
    if (typeof lowerValue !== 'string' || typeof upperValue !== 'string') {
      return false;
    }
    return strict ? upperValue > lowerValue : upperValue >= lowerValue;
  }
  const lower = Number(lowerValue);
  const upper = Number(upperValue);
  if (Number.isNaN(lower) || Number.isNaN(upper)) return false;
  return strict ? upper > lower : upper >= lower;
}

type InternalConstraint =
  | {
      kind: 'comparator';
      lower: string;
      upper: string;
      strict: boolean;
      span: Span;
    }
  | { kind: 'different'; a: string; b: string };

function otherEnd(constraint: InternalConstraint, group: string): string {
  if (constraint.kind === 'comparator') {
    return constraint.lower === group ? constraint.upper : constraint.lower;
  }
  return constraint.a === group ? constraint.b : constraint.a;
}

type Removal = {
  cell: Cell;
  index: number;
  value: VariableValue;
  key: string;
};

function undoRemovals(removals: Removal[]): void {
  // Reinserted in reverse so each recorded index is valid again.
  for (let i = removals.length - 1; i >= 0; i--) {
    const removal = removals[i]!;
    removal.cell.values.splice(removal.index, 0, removal.value);
    removal.cell.keys.splice(removal.index, 0, removal.key);
  }
}

class SearchBudgetExhausted extends Error {}

/**
 * Complete backtracking search over one component: arc-consistency
 * preprocessing, then minimum-remaining-values selection with forward
 * checking. "unsat" is a proof — the whole space was covered; "unknown" means
 * only that the node budget ran out first, and must be treated like an
 * oversized component, never like a refusal.
 */
export function solveComponent(
  component: TractableComponent,
  options: SolveOptions = {},
): SolveVerdict {
  const active = component.groups.filter(
    (group) => !options.exclude?.has(group),
  );
  if (active.length === 0) {
    return { kind: 'sat', assignment: new Map() };
  }
  const activeSet = new Set(active);

  const cells = new Map<string, Cell>();
  for (const group of active) {
    const pin = options.pins?.get(group);
    let values: VariableValue[];
    if (pin !== undefined) {
      values = [pin];
    } else {
      values = component.domains.get(group) ?? [];
      if (options.restrict) {
        values = values.filter((value) => options.restrict!(group, value));
      }
      if (options.orderDomain) {
        values = options.orderDomain(group, values);
      } else {
        values = [...values];
      }
    }
    cells.set(group, { values, keys: values.map((value) => valueKey(value)) });
  }

  const constraints: InternalConstraint[] = [];
  for (const comparator of component.comparators) {
    if (!activeSet.has(comparator.lower) || !activeSet.has(comparator.upper)) {
      continue;
    }
    constraints.push({ kind: 'comparator', ...comparator });
  }
  for (const [a, b] of component.different) {
    if (!activeSet.has(a) || !activeSet.has(b)) continue;
    constraints.push({ kind: 'different', a, b });
  }

  const touching = new Map<string, InternalConstraint[]>();
  for (const group of active) touching.set(group, []);
  for (const constraint of constraints) {
    const [x, y] =
      constraint.kind === 'comparator'
        ? [constraint.lower, constraint.upper]
        : [constraint.a, constraint.b];
    touching.get(x)?.push(constraint);
    touching.get(y)?.push(constraint);
  }

  /**
   * Removes values of `group` with no support in the other end's remaining
   * values. Comparator support only needs the counterpart's extreme value;
   * `differentFrom` can only prune against a counterpart down to one value.
   */
  const revise = (group: string, constraint: InternalConstraint): boolean => {
    const cell = cells.get(group);
    const other = cells.get(otherEnd(constraint, group));
    if (cell === undefined || other === undefined) return false;

    let keep: (index: number) => boolean;
    if (constraint.kind === 'different') {
      if (other.values.length !== 1) return true;
      const forbidden = other.keys[0];
      keep = (index) => cell.keys[index] !== forbidden;
    } else if (other.values.length === 0) {
      keep = () => false;
    } else {
      const groupIsLower = constraint.lower === group;
      keep = (index) =>
        other.values.some((counterpart) =>
          groupIsLower
            ? satisfiesComparator(
                cell.values[index]!,
                counterpart,
                constraint.strict,
                constraint.span,
              )
            : satisfiesComparator(
                counterpart,
                cell.values[index]!,
                constraint.strict,
                constraint.span,
              ),
        );
    }

    let removed = false;
    for (let index = cell.values.length - 1; index >= 0; index--) {
      if (keep(index)) continue;
      cell.values.splice(index, 1);
      cell.keys.splice(index, 1);
      removed = true;
    }
    return !removed || cell.values.length > 0;
  };

  // AC-3 to a fixpoint. `revise` returning false means a domain emptied.
  const queue: [string, InternalConstraint][] = [];
  for (const constraint of constraints) {
    const [x, y] =
      constraint.kind === 'comparator'
        ? [constraint.lower, constraint.upper]
        : [constraint.a, constraint.b];
    queue.push([x, constraint], [y, constraint]);
  }
  while (queue.length > 0) {
    const arc = queue.shift();
    if (arc === undefined) break;
    const [group, constraint] = arc;
    const before = cells.get(group)?.values.length ?? 0;
    if (!revise(group, constraint)) return { kind: 'unsat' };
    const after = cells.get(group)?.values.length ?? 0;
    if (after === before) continue;
    for (const neighbourConstraint of touching.get(group) ?? []) {
      const neighbour = otherEnd(neighbourConstraint, group);
      queue.push([neighbour, neighbourConstraint]);
    }
  }
  for (const cell of cells.values()) {
    if (cell.values.length === 0) return { kind: 'unsat' };
  }

  const maxNodes = options.maxNodes ?? MAX_SEARCH_NODES;
  let nodes = 0;
  const assignment = new Map<string, VariableValue>();

  const consistent = (
    group: string,
    value: VariableValue,
    key: string,
  ): boolean => {
    for (const constraint of touching.get(group) ?? []) {
      const counterpart = otherEnd(constraint, group);
      const held = assignment.get(counterpart);
      if (held === undefined) continue;
      if (constraint.kind === 'different') {
        if (valueKey(held) === key) return false;
      } else if (constraint.lower === group) {
        if (
          !satisfiesComparator(value, held, constraint.strict, constraint.span)
        ) {
          return false;
        }
      } else if (
        !satisfiesComparator(held, value, constraint.strict, constraint.span)
      ) {
        return false;
      }
    }
    return true;
  };

  const forwardCheck = (
    group: string,
    value: VariableValue,
    key: string,
  ): { removals: Removal[]; emptied: boolean } => {
    const removals: Removal[] = [];
    let emptied = false;

    for (const constraint of touching.get(group) ?? []) {
      const counterpart = otherEnd(constraint, group);
      if (assignment.has(counterpart)) continue;
      const cell = cells.get(counterpart);
      if (cell === undefined) continue;

      for (let index = cell.values.length - 1; index >= 0; index--) {
        const candidate = cell.values[index]!;
        let ok: boolean;
        if (constraint.kind === 'different') {
          ok = cell.keys[index] !== key;
        } else if (constraint.lower === counterpart) {
          ok = satisfiesComparator(
            candidate,
            value,
            constraint.strict,
            constraint.span,
          );
        } else {
          ok = satisfiesComparator(
            value,
            candidate,
            constraint.strict,
            constraint.span,
          );
        }
        if (ok) continue;
        removals.push({
          cell,
          index,
          value: candidate,
          key: cell.keys[index]!,
        });
        cell.values.splice(index, 1);
        cell.keys.splice(index, 1);
      }
      if (cell.values.length === 0) emptied = true;
    }

    return { removals, emptied };
  };

  const search = (): boolean => {
    let chosen: string | undefined;
    let narrowest = Number.POSITIVE_INFINITY;
    for (const group of active) {
      if (assignment.has(group)) continue;
      const size = cells.get(group)?.values.length ?? 0;
      if (size < narrowest) {
        narrowest = size;
        chosen = group;
      }
    }
    if (chosen === undefined) return true;

    const cell = cells.get(chosen);
    if (cell === undefined) return false;

    // The cell's arrays are pruned by deeper forward checks, so iterate a
    // snapshot of the values as they stand at this depth.
    const values = [...cell.values];
    const keys = [...cell.keys];
    for (let index = 0; index < values.length; index++) {
      const value = values[index]!;
      const key = keys[index]!;
      if (++nodes > maxNodes) throw new SearchBudgetExhausted();
      if (!consistent(chosen, value, key)) continue;

      assignment.set(chosen, value);
      const { removals, emptied } = forwardCheck(chosen, value, key);
      if (!emptied && search()) return true;
      undoRemovals(removals);
      assignment.delete(chosen);
    }
    return false;
  };

  try {
    if (!search()) return { kind: 'unsat' };
  } catch (error) {
    if (error instanceof SearchBudgetExhausted) return { kind: 'unknown' };
    throw error;
  }

  return { kind: 'sat', assignment };
}
