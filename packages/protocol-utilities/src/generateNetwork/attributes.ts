import type { Variable } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  type NcNode,
  type VariableValue,
} from '@codaco/shared-consts';

import type { VariableEntry } from '../types';
import {
  type EntityScopeRef,
  generateEntityAttributes,
  scopeKey,
  uniqueSlotMembers,
} from './constraints/generateEntityAttributes';
import type { EntityConstraints } from './constraints/types';
import { valueKey } from './constraints/uniqueRegistry';
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
    ref,
    index,
    options,
  );
}

/** The first value any member of a group carries, as the group's value. */
function memberValue(
  memberIds: readonly string[],
  values: Record<string, VariableValue>,
): VariableValue | undefined {
  for (const id of memberIds) {
    const value = values[id];
    if (value !== undefined) return value;
  }
  return undefined;
}

function applyRosterReservations(
  ctx: GenerationContext,
  ref: EntityScopeRef,
  rows: readonly NcNode[],
  hold: boolean,
): void {
  if (rows.length === 0) return;
  const registry = scopeKey(ref);

  for (const [slot, memberIds] of uniqueSlotMembers(constraintsFor(ctx, ref))) {
    for (const row of rows) {
      for (const id of memberIds) {
        const value = row[entityAttributesProperty][id];
        if (value === undefined) continue;
        if (hold) ctx.uniqueRegistry.reserve(registry, slot, value);
        else ctx.uniqueRegistry.unreserve(registry, slot, value);
      }
    }
  }
}

/**
 * Holds every `unique` value a drawable roster row carries back from generated
 * draws. A row is a real person the run may still add, carrying values the
 * researcher supplied rather than ones the registry issued, so a fabricated
 * entity must not be issued a value a row is about to arrive holding.
 */
export function reserveRosterValues(
  ctx: GenerationContext,
  ref: EntityScopeRef,
  rows: readonly NcNode[],
): void {
  applyRosterReservations(ctx, ref, rows, true);
}

/**
 * Gives those reservations back, once the rows are no longer drawable. A row
 * that was never drawn holds nothing, and a value reserved for it would
 * otherwise stay unavailable to entities the rest of the run creates. A row
 * that was drawn keeps its value through the claim made when it arrived.
 */
export function releaseRosterValues(
  ctx: GenerationContext,
  ref: EntityScopeRef,
  rows: readonly NcNode[],
): void {
  applyRosterReservations(ctx, ref, rows, false);
}

/**
 * Re-points an entity's `unique` claims at the values it ends up holding, after
 * a roster row or a prompt's `additionalAttributes` overwrote what was drawn
 * for it.
 *
 * The drawn value has to be given back: it was issued to this entity alone, and
 * once overwritten nobody holds it, so leaving it claimed drains a value space
 * feasibility sized against the entity count. The value that replaced it has to
 * be claimed: it is now in the network, and a later entity issued it as well
 * would be the duplicate `unique` forbids.
 */
export function reclaimOverwrittenValues(
  ctx: GenerationContext,
  ref: EntityScopeRef,
  drawn: Record<string, VariableValue>,
  held: Record<string, VariableValue>,
): void {
  const registry = scopeKey(ref);

  for (const [slot, memberIds] of uniqueSlotMembers(constraintsFor(ctx, ref))) {
    const issued = memberValue(memberIds, drawn);
    if (issued === undefined) continue;

    // A group whose members were overwritten with values that disagree holds
    // every one of them, so every one is claimed.
    const holding = new Map<string, VariableValue>();
    for (const id of memberIds) {
      const value = held[id];
      if (value !== undefined) holding.set(valueKey(value), value);
    }

    if (holding.size === 1 && holding.has(valueKey(issued))) continue;

    ctx.uniqueRegistry.release(registry, slot, issued);
    for (const value of holding.values()) {
      ctx.uniqueRegistry.claim(registry, slot, value);
    }
  }
}
