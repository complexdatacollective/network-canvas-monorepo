import type { Variable } from '@codaco/protocol-validation';
import type { VariableValue } from '@codaco/shared-consts';

import type { VariableEntry } from '../types';
import { generateEntityAttributes } from './constraints/generateEntityAttributes';
import type { EntityConstraints } from './constraints/types';
import type { GenerationContext } from './context';

export function toVariableEntry(id: string, variable: Variable): VariableEntry {
  const options =
    'options' in variable
      ? variable.options?.filter(
          (o): o is { label: string; value: string | number } =>
            typeof o.value !== 'boolean',
        )
      : undefined;

  return {
    id,
    name: variable.name,
    type: variable.type,
    component: 'component' in variable ? variable.component : undefined,
    options,
    validation: 'validation' in variable ? variable.validation : undefined,
    parameters: 'parameters' in variable ? variable.parameters : undefined,
  };
}

/** Which entity's constraints and unique-value registry a draw belongs to. */
type EntityScopeRef =
  | { entity: 'ego' }
  | { entity: 'node' | 'edge'; type: string };

function scopeKey(ref: EntityScopeRef): string {
  return ref.entity === 'ego' ? 'ego' : `${ref.entity}:${ref.type}`;
}

function constraintsFor(
  ctx: GenerationContext,
  ref: EntityScopeRef,
): EntityConstraints {
  if (ref.entity === 'ego') return ctx.entityConstraints.ego;
  return ctx.entityConstraints[ref.entity].get(ref.type) ?? new Map();
}

/**
 * Generates one entity's attributes as a set, so cross-variable rules are
 * satisfied against the values the same entity actually holds.
 *
 * `existing` supplies attributes the entity already carries, which comparison
 * and `differentFrom` rules read but which are not re-emitted; `only` narrows
 * generation to a subset of the type's variables. A partial regeneration needs
 * both, or a rule whose target sits outside the subset has nothing to resolve
 * against.
 */
export function generateAttributesForEntity(
  ctx: GenerationContext,
  ref: EntityScopeRef,
  index: number,
  options?: {
    existing?: Record<string, VariableValue>;
    only?: Set<string>;
  },
): Record<string, VariableValue> {
  return generateEntityAttributes(
    constraintsFor(ctx, ref),
    ctx,
    scopeKey(ref),
    index,
    options,
  );
}
