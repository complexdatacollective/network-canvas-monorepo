import type {
  Stage,
  StructuralCodebook,
  Variables,
} from '@codaco/protocol-validation';
import type { NcNode } from '@codaco/shared-consts';

import type { GenerationConfig } from '../config';
import { collectBinOnlyVariables } from './binOnlyVariables';
import { buildEntityConstraints } from './buildConstraints';
import { type ComparatorEdge, resolveGenerationOrder } from './dependencyOrder';
import { worstCaseEntityCounts } from './entityCounts';
import type { ConstraintConflict } from './error';
import {
  emptyGroupBounds,
  groupComparatorEdges,
  intersectGroupConstraints,
  propagateComparatorBounds,
} from './groupConstraints';
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
};

const NO_UNVALIDATED_VARIABLES: ReadonlySet<string> = new Set();

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
  config: GenerationConfig,
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

  const report = (
    variableIds: string[],
    rules: string[],
    reason: string,
  ): void => {
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
  const { inverted } = propagateComparatorBounds(groups, order, edges);
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

  return conflicts;
}

/**
 * `externalData` is the roster rows generation will draw from, keyed by stage
 * id. Omitting it reads every roster stage as fabricating people, which counts
 * more entities rather than fewer — see {@link worstCaseEntityCounts}.
 */
export function analyseFeasibility(
  codebook: StructuralCodebook,
  stages: Stage[],
  config: GenerationConfig,
  externalData?: Record<string, NcNode[]>,
): ConstraintConflict[] {
  const counts = worstCaseEntityCounts(stages, config, externalData);
  const binOnly = collectBinOnlyVariables(stages);
  const scopes: EntityScope[] = [
    {
      entity: 'ego',
      variables: codebook.ego?.variables,
      unvalidated: NO_UNVALIDATED_VARIABLES,
      worstCaseCount: 1,
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
    });
  }

  return scopes.flatMap((scope) => analyseEntity(scope, config));
}
