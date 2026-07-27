import type { VariableValue } from '@codaco/shared-consts';

import { addSteps, stepsBetween } from './dateWindow';
import type { ComparatorEdge } from './dependencyOrder';
import { comparatorSpan, type Span } from './groupConstraints';
import {
  MAX_COMPONENT_VARIABLES,
  MAX_DOMAIN_PRODUCT,
  MAX_SEARCH_NODES,
} from './solverLimits';
import type { ConstrainedVariable } from './types';
import { valueKey } from './uniqueRegistry';
import { SCALAR_DECIMAL_PLACES, SCALAR_DOMAIN } from './valueSpace';

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
 * Every value the generator can produce for this group, or undefined where the
 * set is unbounded, larger than `cap`, or not faithfully enumerable — a number
 * interval that contains no integer still admits fractional draws, so claiming
 * its enumeration is empty would turn a satisfiable protocol into a refusal.
 */
function enumerateDomain(
  variable: ConstrainedVariable,
  cap: number,
): VariableValue[] | undefined {
  const { entry, constraints } = variable;

  switch (entry.type) {
    case 'boolean':
      return [false, true];

    case 'ordinal': {
      const options = entry.options ?? [];
      if (options.length === 0 || options.length > cap) return undefined;
      return options.map((option) => option.value);
    }

    case 'number': {
      const { minValue, maxValue } = constraints;
      if (minValue === undefined || maxValue === undefined) return undefined;
      if (maxValue < minValue) return [];
      const lo = Math.ceil(minValue);
      const hi = Math.floor(maxValue);
      if (hi < lo) return undefined;
      if (hi - lo + 1 > cap) return undefined;
      return integerRange(lo, hi);
    }

    case 'scalar': {
      const unit = 10 ** SCALAR_DECIMAL_PLACES;
      const min = Math.max(
        constraints.minValue ?? SCALAR_DOMAIN.minValue,
        SCALAR_DOMAIN.minValue,
      );
      const max = Math.min(
        constraints.maxValue ?? SCALAR_DOMAIN.maxValue,
        SCALAR_DOMAIN.maxValue,
      );
      // Mirrors the draw's clamp: an inverted or single-point range collapses
      // to its floor.
      if (max <= min) return [min];
      const lo = Math.ceil(min * unit - 1e-6);
      const hi = Math.floor(max * unit + 1e-6);
      if (hi - lo + 1 > cap) return undefined;
      return integerRange(lo, hi).map((index) =>
        Number((index / unit).toFixed(SCALAR_DECIMAL_PLACES)),
      );
    }

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
      const options = (entry.options ?? []).map((option) => option.value);
      if (options.length === 0) return undefined;
      const min = Math.max(1, constraints.minSelected ?? 1);
      const max = Math.min(
        constraints.maxSelected ?? options.length,
        options.length,
      );
      if (max < min) return [];
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
    // An incomparable pair — a number against a date, or two dates at
    // different resolutions — is a rule the greedy path ignores; a complete
    // search cannot claim to decide a component containing one.
    if (span === undefined) return undefined;
    comparators.push({ ...edge, span });
  }

  const domains = new Map<string, VariableValue[]>();
  let product = 1;
  for (const group of piece.groups) {
    const variable = groups.get(group);
    if (variable === undefined) return undefined;
    const domain = enumerateDomain(variable, MAX_DOMAIN_PRODUCT);
    if (domain === undefined) return undefined;
    product *= Math.max(1, domain.length);
    if (product > MAX_DOMAIN_PRODUCT) return undefined;
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
