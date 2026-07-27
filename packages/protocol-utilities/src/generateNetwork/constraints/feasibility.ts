import type {
  Stage,
  StructuralCodebook,
  Variables,
} from '@codaco/protocol-validation';

import type { GenerationConfig } from '../config';
import { buildEntityConstraints } from './buildConstraints';
import { resolveGenerationOrder } from './dependencyOrder';
import { worstCaseEntityCounts } from './entityCounts';
import { COMPARISON_RULES, type EntityConstraints } from './types';
import { valueSpaceSize } from './valueSpace';

export type ConstraintConflict = {
  entity: 'ego' | 'node' | 'edge';
  entityType?: string;
  variableIds: string[];
  variableNames: string[];
  rules: string[];
  reason: string;
};

export class SyntheticDataConstraintError extends Error {
  readonly conflicts: ConstraintConflict[];

  constructor(conflicts: ConstraintConflict[]) {
    const lines = conflicts.map((conflict) => {
      const subject =
        conflict.entity === 'ego'
          ? 'ego'
          : `${conflict.entity} "${conflict.entityType}"`;
      return `  - ${subject}, ${conflict.variableNames.map((name) => `"${name}"`).join(' and ')} (${conflict.rules.join(', ')}): ${conflict.reason}`;
    });

    super(
      'Synthetic data cannot be generated: this protocol declares validation ' +
        `rules that no value can satisfy.\n${lines.join('\n')}`,
    );
    this.name = 'SyntheticDataConstraintError';
    this.conflicts = conflicts;
  }
}

type EntityScope = {
  entity: 'ego' | 'node' | 'edge';
  entityType?: string;
  variables: Variables | undefined;
  worstCaseCount: number;
};

// Reference-bearing constraint keys, checked against a cycle's members to
// report only the rules actually involved in it.
const REFERENCE_RULES = [
  'sameAs',
  ...COMPARISON_RULES,
  'differentFrom',
] as const;

function namesOf(entity: EntityConstraints, ids: string[]): string[] {
  return ids.map((id) => entity.get(id)?.entry.name ?? id);
}

function analyseEntity(
  scope: EntityScope,
  config: GenerationConfig,
): ConstraintConflict[] {
  const entity = buildEntityConstraints(scope.variables, config.today);
  const conflicts: ConstraintConflict[] = [];

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

    for (const rule of COMPARISON_RULES) {
      const targetId = constraints[rule];
      if (targetId === undefined) continue;

      const target = entity.get(targetId);
      if (!target) continue;

      const wantsGreater =
        rule === 'greaterThanVariable' ||
        rule === 'greaterThanOrEqualToVariable';
      const opposite = wantsGreater
        ? (constraints.lessThanVariable ??
          constraints.lessThanOrEqualToVariable)
        : (constraints.greaterThanVariable ??
          constraints.greaterThanOrEqualToVariable);

      if (opposite === targetId) {
        report(
          [id, targetId],
          [rule, wantsGreater ? 'lessThanVariable' : 'greaterThanVariable'],
          'cannot be both greater than and less than the same variable',
        );
      }

      const selfBound = wantsGreater
        ? constraints.maxValue
        : constraints.minValue;
      const targetBound = wantsGreater
        ? target.constraints.minValue
        : target.constraints.maxValue;

      if (selfBound !== undefined && targetBound !== undefined) {
        const impossible = wantsGreater
          ? selfBound <= targetBound
          : selfBound >= targetBound;
        if (impossible) {
          report(
            [id, targetId],
            [rule],
            `its own bounds cannot reach a value ${wantsGreater ? 'above' : 'below'} "${target.entry.name}"`,
          );
        }
      }
    }

    if (constraints.unique) {
      if (scope.entity === 'ego') {
        report([id], ['unique'], 'unique is not supported on ego variables');
      } else {
        const size = valueSpaceSize(variable, scope.worstCaseCount);
        if (size !== 'unbounded' && size < scope.worstCaseCount) {
          report(
            [id],
            ['unique'],
            `only ${size} distinct values are possible, but up to ${scope.worstCaseCount} ${scope.entity}s of this type can be generated`,
          );
        }
      }
    }
  }

  for (const cycle of resolveGenerationOrder(entity).cycles) {
    const rules = REFERENCE_RULES.filter((rule) =>
      cycle.some((id) => entity.get(id)?.constraints[rule] !== undefined),
    );
    report(
      cycle,
      rules,
      'these variables reference each other in a cycle that no assignment can satisfy',
    );
  }

  return conflicts;
}

export function analyseFeasibility(
  codebook: StructuralCodebook,
  stages: Stage[],
  config: GenerationConfig,
): ConstraintConflict[] {
  const counts = worstCaseEntityCounts(stages, config);
  const scopes: EntityScope[] = [
    {
      entity: 'ego',
      variables: codebook.ego?.variables,
      worstCaseCount: 1,
    },
  ];

  for (const [type, definition] of Object.entries(codebook.node ?? {})) {
    scopes.push({
      entity: 'node',
      entityType: type,
      variables: definition.variables,
      worstCaseCount: counts.node.get(type) ?? 0,
    });
  }

  for (const [type, definition] of Object.entries(codebook.edge ?? {})) {
    scopes.push({
      entity: 'edge',
      entityType: type,
      variables: definition.variables,
      worstCaseCount: counts.edge.get(type) ?? 0,
    });
  }

  return scopes.flatMap((scope) => analyseEntity(scope, config));
}
