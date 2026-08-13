import type { Variable } from '@codaco/protocol-validation';
import type { VariableValue } from '@codaco/shared-consts';

import type { VariableEntry } from '../types';
import {
  type EntityScopeRef,
  generateEntityAttributes,
  scopeKey,
  uniqueSlotMembers,
} from './constraints/generateEntityAttributes';
import type { EntityConstraints } from './constraints/types';
import type { GenerationContext } from './context';

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
    // Load-bearing: the draw resolves a variable's distribution from its
    // entry, so dropping this here silently returns every declared
    // distribution, generator, option weighting and missingness to its
    // default while counts and topology — read straight off the codebook —
    // went on working.
    synthetic: 'synthetic' in variable ? variable.synthetic : undefined,
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
    /** Variables drawn as Sociogram highlights, which have their own rate. */
    highlightVariables?: ReadonlySet<string>;
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
 * Holds the `unique` values an entity will be given from outside the registry
 * back from generated draws, without issuing them.
 *
 * The plan walks a type's creating stages in interview order, so a stage that
 * draws freely runs before a later stage's prompt or roster row is known. A
 * free draw that took a value one of those will write leaves the network
 * holding it twice, which `unique` forbids and nothing downstream repairs.
 * Reservations are soft — a draw with nothing else left takes one anyway —
 * which is the right strength here: refusing a value on account of an entity
 * the run may never build would fail protocols that generate perfectly well.
 *
 * Every hold is released as its value is consumed or its row passed over, so
 * a pool the draw never reaches stops constraining it.
 */
export function reserveFixedValues(
  ctx: GenerationContext,
  ref: EntityScopeRef,
  fixed: Record<string, VariableValue>,
): void {
  const registry = scopeKey(ref);

  for (const [slot, memberIds] of uniqueSlotMembers(constraintsFor(ctx, ref))) {
    for (const id of memberIds) {
      const value = fixed[id];
      if (value !== undefined)
        ctx.uniqueRegistry.reserve(registry, slot, value);
    }
  }
}

export function unreserveFixedValues(
  ctx: GenerationContext,
  ref: EntityScopeRef,
  fixed: Record<string, VariableValue>,
): void {
  const registry = scopeKey(ref);

  for (const [slot, memberIds] of uniqueSlotMembers(constraintsFor(ctx, ref))) {
    for (const id of memberIds) {
      const value = fixed[id];
      if (value !== undefined) {
        ctx.uniqueRegistry.unreserve(registry, slot, value);
      }
    }
  }
}

/**
 * Draws one variable onto an entity the plan does not own.
 *
 * A FamilyPedigree builds its people and links during the session walk rather
 * than in the plan, so a later stage that writes onto them has no planned
 * value to land. The value is drawn here instead, against the same constraints
 * and the same registry every other value was drawn against — the pedigree's
 * own materialisation already works this way, so this keeps one entity's
 * history consistent rather than introducing a second source of values.
 *
 * Whatever the entity already holds for the variable is released from the
 * registry and withheld from the draw: this is the last writer replacing an
 * earlier value, so keeping the old one issued would have the entity competing
 * with itself for a `unique` slot, and leaving it in `existing` would pin the
 * redraw to the value it is meant to replace.
 */
export function drawVariableOnto(
  ctx: GenerationContext,
  ref: EntityScopeRef,
  attributes: Record<string, VariableValue>,
  variableId: string,
  index: number,
): void {
  const registry = scopeKey(ref);
  for (const [slot, memberIds] of uniqueSlotMembers(constraintsFor(ctx, ref))) {
    if (!memberIds.includes(variableId)) continue;
    for (const id of memberIds) {
      const value = attributes[id];
      if (value !== undefined)
        ctx.uniqueRegistry.release(registry, slot, value);
    }
  }

  const context = { ...attributes };
  delete context[variableId];
  const drawn = generateAttributesForEntity(ctx, ref, index, {
    existing: context,
    only: new Set([variableId]),
  });
  if (variableId in drawn) attributes[variableId] = drawn[variableId]!;
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
