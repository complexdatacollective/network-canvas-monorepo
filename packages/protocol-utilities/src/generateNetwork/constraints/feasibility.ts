import type {
  Stage,
  StructuralCodebook,
  Variables,
} from '@codaco/protocol-validation';
import type { NcNode, VariableValue } from '@codaco/shared-consts';

import type { ResolvedGenerationConfig } from '../config';
import {
  collectPromptFixedAssignments,
  countPromptFixedValues,
  type PromptFixedValues,
  ruleBrokenByFixedValues,
} from '../nodes';
import { collectBinOnlyVariables } from './binOnlyVariables';
import { buildEntityConstraints } from './buildConstraints';
import { type ComparatorEdge, resolveGenerationOrder } from './dependencyOrder';
import { worstCaseEntityCounts } from './entityCounts';
import type { ConstraintConflict } from './error';
import {
  differentFromGroups,
  emptyGroupBounds,
  groupComparatorEdges,
  intersectGroupConstraints,
  propagateComparatorBounds,
} from './groupConstraints';
import { solvableComponents, solveComponent } from './solver';
import {
  COMPARISON_RULES,
  type ConstrainedVariable,
  type EntityConstraints,
} from './types';
import { valueSpaceSize } from './valueSpace';

type EntityScope = {
  entity: 'ego' | 'node' | 'edge';
  entityType?: string;
  entityTypeName?: string;
  variables: Variables | undefined;
  /** Variables of this type whose rules nothing in the interview applies. */
  unvalidated: ReadonlySet<string>;
  worstCaseCount: number;
  /** Values prompts write onto this type, and how many entities can hold each. */
  fixedValues: PromptFixedValues;
  /** Each prompt's whole set of values, as one entity ends up holding it. */
  fixedAssignments: readonly Record<string, VariableValue>[];
};

const NO_UNVALIDATED_VARIABLES: ReadonlySet<string> = new Set();
const NO_FIXED_VALUES: PromptFixedValues = new Map();
const NO_FIXED_ASSIGNMENTS: readonly Record<string, VariableValue>[] = [];

// The reference-bearing constraints that can merge two variables into one
// group: `sameAs` directly, and a comparator as one link of a non-strict cycle.
const MERGING_RULES = ['sameAs', ...COMPARISON_RULES] as const;

// Reference-bearing constraint keys, checked against a cycle's members to
// report only the rules actually involved in it.
const REFERENCE_RULES = [...MERGING_RULES, 'differentFrom'] as const;

function namesOf(entity: EntityConstraints, ids: string[]): string[] {
  return ids.map((id) => entity.get(id)?.entry.name ?? id);
}

/**
 * Groups joined by comparators, as the sets that have to be satisfiable
 * together. Reporting per component rather than per variable describes a chain
 * once, instead of naming each link of it as its own conflict.
 */
function comparatorComponents(edges: readonly ComparatorEdge[]): string[][] {
  const adjacency = new Map<string, Set<string>>();

  const link = (from: string, to: string): void => {
    const neighbours = adjacency.get(from) ?? new Set<string>();
    neighbours.add(to);
    adjacency.set(from, neighbours);
  };

  for (const edge of edges) {
    link(edge.lower, edge.upper);
    link(edge.upper, edge.lower);
  }

  const seen = new Set<string>();
  const components: string[][] = [];

  for (const start of adjacency.keys()) {
    if (seen.has(start)) continue;
    seen.add(start);

    const component: string[] = [];
    const pending = [start];
    while (pending.length > 0) {
      const group = pending.pop();
      if (group === undefined) break;
      component.push(group);
      for (const next of adjacency.get(group) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        pending.push(next);
      }
    }

    components.push(component);
  }

  return components;
}

function analyseEntity(
  scope: EntityScope,
  config: ResolvedGenerationConfig,
): ConstraintConflict[] {
  const entity = buildEntityConstraints(
    scope.variables,
    config.today,
    scope.unvalidated,
  );
  const conflicts: ConstraintConflict[] = [];

  const { order, membersOf, groupOf, cycles } = resolveGenerationOrder(entity);
  const groups = intersectGroupConstraints(entity, membersOf);
  const uniqueReported = new Set<string>();
  const fixedReported = new Set<string>();
  // Groups an earlier check has already refused. The complete search below
  // skips components touching them: re-proving a contradiction that already
  // has a targeted message would only report it twice, less usefully.
  const implicated = new Set<string>();

  // Folded onto groups because a `unique` value is claimed once for the whole
  // group its members share: two prompts fixing one value on two variables held
  // equal spend the same value twice, exactly as one prompt fixing it twice.
  const fixedByGroup = new Map<string, Map<string, number>>();
  const fixedDisplay = new Map<string, string>();
  for (const [id, values] of scope.fixedValues) {
    if (!entity.has(id)) continue;
    const group = groupOf.get(id) ?? id;
    const carriers = fixedByGroup.get(group) ?? new Map<string, number>();
    for (const [key, { value, count }] of values) {
      carriers.set(key, (carriers.get(key) ?? 0) + count);
      fixedDisplay.set(key, String(value));
    }
    fixedByGroup.set(group, carriers);
  }

  const report = (
    variableIds: string[],
    rules: string[],
    reason: string,
  ): void => {
    for (const id of variableIds) implicated.add(groupOf.get(id) ?? id);
    conflicts.push({
      entity: scope.entity,
      ...(scope.entityType !== undefined
        ? { entityType: scope.entityType }
        : {}),
      ...(scope.entityTypeName !== undefined
        ? { entityTypeName: scope.entityTypeName }
        : {}),
      variableIds,
      variableNames: namesOf(entity, variableIds),
      rules,
      reason,
    });
  };

  // A rule with both of its ends fixed is settled before anything is drawn:
  // the prompt states both values, so the pair the finished node holds is the
  // pair the protocol wrote. Nothing a seed does can rescue one the rule
  // cannot hold, which is what makes this a refusal here rather than a draw
  // that fails on some seeds and not others.
  const brokenReported = new Set<string>();
  for (const assignment of scope.fixedAssignments) {
    const broken = ruleBrokenByFixedValues(entity, assignment);
    if (broken === undefined) continue;

    const key = `${broken.rule}:${broken.variableIds.join(',')}`;
    if (brokenReported.has(key)) continue;
    brokenReported.add(key);

    report(
      broken.variableIds,
      [broken.rule, 'additionalAttributes'],
      `a prompt fixes these variables to ${broken.values
        .map((value) => String(value))
        .join(' and ')}, which ${broken.rule} cannot hold`,
    );
  }

  for (const [id, variable] of entity) {
    const { constraints, entry } = variable;

    if (
      constraints.minLength !== undefined &&
      constraints.maxLength !== undefined &&
      constraints.minLength > constraints.maxLength
    ) {
      report(
        [id],
        ['minLength', 'maxLength'],
        `minLength ${constraints.minLength} exceeds maxLength ${constraints.maxLength}`,
      );
    }

    if (
      constraints.minValue !== undefined &&
      constraints.maxValue !== undefined &&
      constraints.minValue > constraints.maxValue
    ) {
      report(
        [id],
        ['minValue', 'maxValue'],
        `minValue ${constraints.minValue} exceeds maxValue ${constraints.maxValue}`,
      );
    }

    if (
      constraints.minSelected !== undefined &&
      constraints.maxSelected !== undefined &&
      constraints.minSelected > constraints.maxSelected
    ) {
      report(
        [id],
        ['minSelected', 'maxSelected'],
        `minSelected ${constraints.minSelected} exceeds maxSelected ${constraints.maxSelected}`,
      );
    }

    // `maxSelected: 0` leaves the empty selection as the only drawable value,
    // and `required` is the one rule that rejects it. Without this the draw
    // emits `[]` and the interview refuses it — invalid data rather than a
    // refusal, which is the outcome this pass exists to prevent.
    if (constraints.required && constraints.maxSelected === 0) {
      report(
        [id],
        ['required', 'maxSelected'],
        'maxSelected 0 permits only an empty selection, which required rejects',
      );
    }

    // The same contradiction in the length rules: `maxLength: 0` leaves the
    // empty string as the only value it permits, and `required` rejects it.
    // `textDrawLength` picks length 0 and `fitToLength` emits `""`.
    if (constraints.required && constraints.maxLength === 0) {
      report(
        [id],
        ['required', 'maxLength'],
        'maxLength 0 permits only an empty string, which required rejects',
      );
    }

    const optionCount = entry.options?.length ?? 0;
    if (
      constraints.minSelected !== undefined &&
      optionCount > 0 &&
      constraints.minSelected > optionCount
    ) {
      report(
        [id],
        ['minSelected'],
        `minSelected ${constraints.minSelected} exceeds the ${optionCount} available options`,
      );
    }

    const window = constraints.dateWindow;
    if (
      window?.min !== undefined &&
      window.max !== undefined &&
      window.min > window.max
    ) {
      report(
        [id],
        ['parameters'],
        `the date range ${window.min} to ${window.max} is empty`,
      );
    }

    // A variable naming the same target for both `sameAs` and `differentFrom`
    // forces that pair into one equality group whose `differentFrom` then
    // points at itself; `resolveGenerationOrder`'s cycle detection (below)
    // already reports that self-loop, so no separate check is needed here.

    if (constraints.unique) {
      if (scope.entity === 'ego') {
        report([id], ['unique'], 'unique is not supported on ego variables');
      } else {
        // Measured against the group's intersected rules, because that is what
        // the generator draws against: a variable held equal to a narrower one
        // reaches only the narrower value space, however wide its own is.
        const group = groupOf.get(id) ?? id;
        const members = membersOf.get(group) ?? [id];
        const size = valueSpaceSize(
          groups.get(group) ?? variable,
          scope.worstCaseCount,
        );

        if (
          size !== 'unbounded' &&
          size < scope.worstCaseCount &&
          !uniqueReported.has(group)
        ) {
          uniqueReported.add(group);
          report(
            members,
            ['unique'],
            `only ${size} distinct values are possible${members.length > 1 ? ' once these variables are held equal' : ''}, but up to ${scope.worstCaseCount} ${scope.entity}s of this type can be generated`,
          );
        }

        // A value a prompt fixes is written onto every node the prompt creates
        // rather than drawn, so no seed can spread it over more than one
        // holder: a prompt that fixes a `unique` value and can create two
        // people is asking for a value two of them hold, which no assignment
        // satisfies. Refused here rather than at the draw, so the protocol
        // fails the same way on every seed instead of on the ones whose node
        // count happened to reach two.
        const spent = [...(fixedByGroup.get(group) ?? [])].filter(
          ([, count]) => count > 1,
        );
        if (spent.length > 0 && !fixedReported.has(group)) {
          fixedReported.add(group);
          const detail = spent
            .map(
              ([key, count]) =>
                `${fixedDisplay.get(key) ?? key} on up to ${count} ${scope.entity}s`,
            )
            .join(' and to ');
          report(
            members,
            ['unique', 'additionalAttributes'],
            `a prompt fixes ${members.length > 1 ? 'these variables, which are held equal,' : 'this'} to ${detail}, but unique allows one ${scope.entity} to hold a value`,
          );
        }
      }
    }
  }

  // A group's members all hold one value, so it has to satisfy every member's
  // bounds at once. Merged by `sameAs` or by a cycle of non-strict comparators,
  // members whose own ranges are each satisfiable can still leave no range
  // between them, and no draw can be inside a range that is not there.
  for (const [group, memberIds] of membersOf) {
    if (memberIds.length < 2) continue;

    const intersected = groups.get(group);
    if (intersected === undefined) continue;

    const members: ConstrainedVariable[] = [];
    for (const id of memberIds) {
      const member = entity.get(id);
      if (member !== undefined) members.push(member);
    }

    const crossings = emptyGroupBounds(members, intersected.constraints);
    if (crossings.length === 0) continue;

    const held = MERGING_RULES.filter((rule) =>
      memberIds.some((id) => {
        const target = entity.get(id)?.constraints[rule];
        return target !== undefined && memberIds.includes(target);
      }),
    );

    report(
      memberIds,
      [...held, ...crossings.flatMap((crossing) => crossing.rules)],
      'these variables are held to a single value, but their bounds do not ' +
        `overlap: ${crossings.map((crossing) => crossing.detail).join('; ')}`,
    );
  }

  // Comparators only contradict each other as a system: `a < b < c` on `[0, 1]`
  // has three pairs that each fit and no assignment that does. Propagation
  // settles the whole system, and a group left with an empty range is a chain
  // the declared bounds cannot hold. It reports only the groups its own walks
  // emptied — a group whose range had already crossed over is one of the two
  // checks above, a single variable's bounds or a group's members' against each
  // other, and neither needs a comparator to be wrong.
  const edges = groupComparatorEdges(entity, groupOf);
  const { groups: propagated, inverted } = propagateComparatorBounds(
    groups,
    order,
    edges,
  );
  const cyclicGroups = new Set(
    cycles.flat().map((id) => groupOf.get(id) ?? id),
  );

  for (const component of comparatorComponents(edges)) {
    if (!component.some((group) => inverted.has(group))) continue;
    // A cycle is reported below with the reason that describes it; its members'
    // bounds crossing over is that same contradiction counted twice.
    if (component.some((group) => cyclicGroups.has(group))) continue;

    const members = new Set(component);
    const ids = [...entity.keys()].filter((id) =>
      members.has(groupOf.get(id) ?? id),
    );
    const rules = COMPARISON_RULES.filter((rule) =>
      ids.some((id) => {
        const target = entity.get(id)?.constraints[rule];
        return target !== undefined && entity.has(target);
      }),
    );

    report(
      ids,
      rules,
      'the comparisons between these variables do not fit inside the bounds they declare',
    );
  }

  for (const cycle of cycles) {
    const rules = REFERENCE_RULES.filter((rule) =>
      cycle.some((id) => entity.get(id)?.constraints[rule] !== undefined),
    );
    // Without a comparator the group is held together by `sameAs` alone, so the
    // contradiction is a `differentFrom` inside it rather than a chain of
    // mutual references.
    const involvesComparator = COMPARISON_RULES.some((rule) =>
      rules.includes(rule),
    );

    report(
      cycle,
      rules,
      involvesComparator
        ? 'these variables reference each other in a cycle that no assignment can satisfy'
        : 'these variables are required to be both equal and different',
    );
  }

  // Interval reasoning cannot represent "this range minus the value another
  // variable took", so shapes like a differentFrom pinned to a single shared
  // value slip through every check above and used to surface as seed-dependent
  // draw failures. Where a component's domains are small enough to enumerate,
  // a complete search settles it: exhausting the space without a solution is a
  // proof of unsatisfiability, and anything short of that proof — including a
  // search that ran out of budget — never refuses.
  const components = solvableComponents(
    propagated,
    order,
    edges,
    differentFromGroups(entity, groupOf),
  );
  for (const component of components) {
    if (component.tractable === undefined) continue;
    if (component.groups.some((group) => implicated.has(group))) continue;
    if (solveComponent(component.tractable).kind !== 'unsat') continue;

    const members = new Set(component.groups);
    const ids = [...entity.keys()].filter((id) =>
      members.has(groupOf.get(id) ?? id),
    );
    report(
      ids,
      solvedComponentRules(entity, ids),
      'no combination of values these rules allow can satisfy all of them at once',
    );
  }

  return conflicts;
}

/**
 * The rules a solver refusal names: every reference rule the component's
 * members declare, plus the declared bounds that box the search in. A scalar's
 * implicit 0-1 scale is left out — naming a rule the protocol never wrote
 * points its author at nothing.
 */
function solvedComponentRules(
  entity: EntityConstraints,
  ids: readonly string[],
): string[] {
  const rules = new Set<string>(
    REFERENCE_RULES.filter((rule) =>
      ids.some((id) => entity.get(id)?.constraints[rule] !== undefined),
    ),
  );

  for (const id of ids) {
    const variable = entity.get(id);
    if (variable === undefined) continue;
    const { entry, constraints } = variable;

    if (entry.type !== 'scalar') {
      if (constraints.minValue !== undefined) rules.add('minValue');
      if (constraints.maxValue !== undefined) rules.add('maxValue');
    }
    if (constraints.minSelected !== undefined) rules.add('minSelected');
    if (constraints.maxSelected !== undefined) rules.add('maxSelected');
    const window = constraints.dateWindow;
    if (
      window !== undefined &&
      (window.min !== undefined || window.max !== undefined)
    ) {
      rules.add('parameters');
    }
  }

  return [...rules];
}

/**
 * `externalData` is the roster rows generation will draw from, keyed by stage
 * id. Omitting it reads every roster stage as fabricating people, which counts
 * more entities rather than fewer — see {@link worstCaseEntityCounts}.
 */
export function analyseFeasibility(
  codebook: StructuralCodebook,
  stages: Stage[],
  config: ResolvedGenerationConfig,
  externalData?: Record<string, NcNode[]>,
): ConstraintConflict[] {
  const counts = worstCaseEntityCounts(stages, config, externalData);
  const binOnly = collectBinOnlyVariables(stages);
  const promptFixed = countPromptFixedValues(stages, config, externalData);
  const promptAssignments = collectPromptFixedAssignments(stages, externalData);
  const scopes: EntityScope[] = [
    {
      entity: 'ego',
      variables: codebook.ego?.variables,
      unvalidated: NO_UNVALIDATED_VARIABLES,
      worstCaseCount: 1,
      // No stage fixes a value on ego: `additionalAttributes` belongs to a
      // name-generator prompt, whose subject is always a node.
      fixedValues: NO_FIXED_VALUES,
      fixedAssignments: NO_FIXED_ASSIGNMENTS,
    },
  ];

  for (const [type, definition] of Object.entries(codebook.node ?? {})) {
    scopes.push({
      entity: 'node',
      entityType: type,
      ...(definition.name !== undefined
        ? { entityTypeName: definition.name }
        : {}),
      variables: definition.variables,
      unvalidated: binOnly.get(type) ?? NO_UNVALIDATED_VARIABLES,
      worstCaseCount: counts.node.get(type) ?? 0,
      fixedValues: promptFixed.get(type) ?? NO_FIXED_VALUES,
      fixedAssignments: promptAssignments.get(type) ?? NO_FIXED_ASSIGNMENTS,
    });
  }

  for (const [type, definition] of Object.entries(codebook.edge ?? {})) {
    scopes.push({
      entity: 'edge',
      entityType: type,
      ...(definition.name !== undefined
        ? { entityTypeName: definition.name }
        : {}),
      variables: definition.variables,
      // Both binning stages take a node subject, so no edge variable can be
      // bin-assigned.
      unvalidated: NO_UNVALIDATED_VARIABLES,
      worstCaseCount: counts.edge.get(type) ?? 0,
      // `additionalAttributes` writes onto the nodes a prompt creates, never
      // onto an edge.
      fixedValues: NO_FIXED_VALUES,
      fixedAssignments: NO_FIXED_ASSIGNMENTS,
    });
  }

  return scopes.flatMap((scope) => analyseEntity(scope, config));
}
