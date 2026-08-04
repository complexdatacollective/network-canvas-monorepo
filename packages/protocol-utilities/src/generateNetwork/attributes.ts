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
import type { GenerationContext } from './context';
import type { PromptFixedValues } from './nodes';

export function toVariableEntry(id: string, variable: Variable): VariableEntry {
  const options =
    'options' in variable
      ? variable.options?.map((option) => ({
          label: option.label,
          value: option.value,
          ...('negative' in option && option.negative !== undefined
            ? { negative: option.negative }
            : {}),
        }))
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

/** The rules one entity scope draws against, whichever scope it is. */
export function constraintsFor(
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
    preferRealisticNameVariables?: ReadonlySet<string>;
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
 * Whether the network can still take every `unique` value the node built from a
 * roster row would hold.
 *
 * Asked of the assignment that will actually be written — the row merged with
 * the prompt's `additionalAttributes`, as `createNodesForStage` settles it —
 * rather than of the row as it arrived. Where a prompt's value wins the
 * collision the row's own value is never written and the prompt's is, so a
 * check reading the row answers about a value no node ends up holding: it
 * passes over a row the network could still take, and lets through one whose
 * finished node repeats a value the registry has already issued.
 *
 * A row's values are the researcher's rather than the registry's, so nothing
 * stops two rows offering one value for a variable the codebook marks `unique`.
 * A roster is a pool of candidates the run draws a subset of, so a row that
 * would repeat a value already in the network is passed over rather than
 * refused — leaving a row undrawn contradicts nothing the protocol declares,
 * and refusing on account of rows the draw may never reach would fail a
 * protocol that generates perfectly well.
 *
 * Reservations are not consulted: the whole drawable pool is reserved before a
 * draw begins, so every row would fail a check that read them.
 */
export function rosterRowIsDrawable(
  ctx: GenerationContext,
  ref: EntityScopeRef,
  fixed: Record<string, VariableValue>,
): boolean {
  const registry = scopeKey(ref);

  for (const [slot, memberIds] of uniqueSlotMembers(constraintsFor(ctx, ref))) {
    for (const id of memberIds) {
      const value = fixed[id];
      if (value === undefined) continue;
      if (ctx.uniqueRegistry.isTaken(registry, slot, value)) return false;
    }
  }

  return true;
}

/**
 * Holds back every `unique` value a prompt's `additionalAttributes` will fix,
 * for the whole run and before any stage draws.
 *
 * A fixed value only reaches the registry when the node carrying it is built,
 * which is too late for the stages that ran first: a boolean `unique` variable
 * drawn on an earlier stage takes the first value of its sequence, a later
 * prompt fixes that same value, and the finished network holds it twice — the
 * duplicate `unique` forbids, on every seed. The prompt's value is protocol
 * rather than draw, so it is known before the run starts and can be kept out of
 * the earlier draw's way.
 *
 * Reserved rather than claimed, because a claim is a refusal: a prompt whose
 * stage the run never reaches, or that creates no node, would take a value out
 * of circulation for people who really needed it, and a value space sized to
 * the entity count would then run out. A reservation only redirects a draw that
 * has somewhere else to go.
 *
 * `fixedByType` is the same tally feasibility counts against the node ceiling,
 * so a value it found could never land — every row of a roster stage already
 * supplying the variable — is absent here too and reserves nothing.
 */
export function reservePromptFixedValues(
  ctx: GenerationContext,
  fixedByType: Map<string, PromptFixedValues>,
): void {
  for (const [type, byVariable] of fixedByType) {
    const ref: EntityScopeRef = { entity: 'node', type };
    const registry = scopeKey(ref);

    for (const [slot, memberIds] of uniqueSlotMembers(
      constraintsFor(ctx, ref),
    )) {
      for (const id of memberIds) {
        for (const { value } of byVariable.get(id)?.values() ?? []) {
          ctx.uniqueRegistry.reserve(registry, slot, value);
        }
      }
    }
  }
}

/**
 * Records the `unique` values an entity was given from outside the registry — a
 * roster row's, a prompt's `additionalAttributes`.
 *
 * Generation is handed these as existing values and draws the rest of the
 * entity around them, so nothing was ever issued for them to give back. What is
 * left is to record them: they are in the network, and a later entity issued
 * one as well would be the duplicate `unique` forbids. A group whose members
 * were fixed to values that disagree holds every one of them, so every one is
 * claimed.
 */
export function claimFixedValues(
  ctx: GenerationContext,
  ref: EntityScopeRef,
  fixed: Record<string, VariableValue>,
): void {
  const registry = scopeKey(ref);

  for (const [slot, memberIds] of uniqueSlotMembers(constraintsFor(ctx, ref))) {
    for (const id of memberIds) {
      const value = fixed[id];
      if (value !== undefined) ctx.uniqueRegistry.claim(registry, slot, value);
    }
  }
}

/**
 * Replaces fixed values on an entity that already contributed to the unique
 * registry. Unlike {@link claimFixedValues}, this releases the affected slot's
 * previous value before claiming the replacement, so normalising an inherited
 * entity does not leave a value it no longer holds unavailable to later draws.
 */
export function replaceFixedValues(
  ctx: GenerationContext,
  ref: EntityScopeRef,
  previous: Record<string, VariableValue>,
  fixed: Record<string, VariableValue>,
): void {
  const registry = scopeKey(ref);

  for (const [slot, memberIds] of uniqueSlotMembers(constraintsFor(ctx, ref))) {
    if (!memberIds.some((id) => id in fixed)) continue;

    for (const id of memberIds) {
      const value = previous[id];
      if (value !== undefined)
        ctx.uniqueRegistry.release(registry, slot, value);
    }
    for (const id of memberIds) {
      const value = fixed[id];
      if (value !== undefined) ctx.uniqueRegistry.claim(registry, slot, value);
    }
  }
}
