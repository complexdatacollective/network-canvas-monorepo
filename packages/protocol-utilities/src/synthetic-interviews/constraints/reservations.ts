import type { Stage } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  type NcNode,
  type VariableValue,
} from '@codaco/shared-consts';

import type { AssetData } from '../simulators/types';
import type { EntityConstraintCache } from './entityConstraintCache';
import {
  type EntityScopeRef,
  scopeKey,
  uniqueSlotMembers,
} from './generateEntityAttributes';
import type { UniqueRegistry } from './uniqueRegistry';

/**
 * The `unique` bookkeeping for values a session is HANDED rather than draws: a
 * prompt's `additionalAttributes`, and the rows of a roster the participant may
 * still nominate from.
 *
 * Both are protocol or host data known before the first stage runs, and both
 * end up on nodes without the registry ever issuing them. Left to itself, a
 * draw on an earlier stage takes the value the later prompt fixes — or the one
 * a roster row is carrying — and the finished network holds a `unique` value
 * twice, on every seed. Holding them back up front is what keeps the earlier
 * draw out of their way.
 *
 * RESERVED rather than claimed, throughout. A reservation only redirects a
 * draw that has somewhere else to go: a prompt whose stage the walk never
 * reaches, or a roster row nobody nominates, must not take a value out of
 * circulation for people who really needed it, or a value space sized to the
 * entity count would run out.
 *
 * Ported from the G2 engine's `generateNetwork/attributes.ts` and
 * `generateNetwork/nodes.ts`, which is where the reasoning above was worked
 * out; the only change is that the constraints arrive through the session's
 * cache rather than a `GenerationContext`.
 */

type NameGeneratorStage = Extract<
  Stage,
  { type: 'NameGenerator' | 'NameGeneratorQuickAdd' }
>;

const isNameGeneratorStage = (stage: Stage): stage is NameGeneratorStage =>
  stage.type === 'NameGenerator' || stage.type === 'NameGeneratorQuickAdd';

const applyRosterReservations = (
  {
    entityConstraints,
    uniqueRegistry,
  }: {
    entityConstraints: EntityConstraintCache;
    uniqueRegistry: UniqueRegistry;
  },
  scope: EntityScopeRef,
  rows: readonly NcNode[],
  hold: boolean,
): void => {
  if (rows.length === 0) return;
  const registry = scopeKey(scope);

  for (const [slot, memberIds] of uniqueSlotMembers(
    entityConstraints.forScope(scope),
  )) {
    for (const row of rows) {
      for (const id of memberIds) {
        const value = row[entityAttributesProperty][id];
        if (value === undefined || value === null) continue;
        if (hold) uniqueRegistry.reserve(registry, slot, value);
        else uniqueRegistry.unreserve(registry, slot, value);
      }
    }
  }
};

type SessionHandles = {
  entityConstraints: EntityConstraintCache;
  uniqueRegistry: UniqueRegistry;
};

/**
 * Holds back every `unique` value the roster rows of every roster-backed stage
 * carry, before any stage draws.
 *
 * A row is a real person the run may still add, carrying values the researcher
 * supplied rather than ones the registry issued. Held only while the row's own
 * stage was drawing, that guards nothing against the stages before it: a
 * fabricated node takes the value first, the row is then a duplicate of what
 * the network already holds, {@link rosterRowIsDrawable} passes it over for
 * good, and the roster the protocol was written around loses a person a
 * different draw would have left room for.
 */
export const reserveRosterValues = (
  handles: SessionHandles,
  stages: readonly Stage[],
  assetData: AssetData,
): void => {
  for (const stage of stages) {
    if (!isNameGeneratorStage(stage)) continue;
    const rows = assetData.rosterNodes?.[stage.id];
    if (rows === undefined) continue;
    applyRosterReservations(
      handles,
      { entity: 'node', type: stage.subject.type },
      rows,
      true,
    );
  }
};

/**
 * Gives one stage's roster hold back, once the stage has had its chance to
 * draw.
 *
 * Rows are pooled per stage, so once a stage is behind the walk its undrawn
 * rows are people nobody is waiting for, and holding their values any longer
 * would narrow every draw that follows for nothing. A row that WAS drawn keeps
 * its value through the claim made when it arrived, so it needs no hold either.
 * Each stage holds separately, so a stage still to come that lists the same row
 * keeps its own.
 *
 * A stage the walk never reaches — skipped, or past the point a drop-out ended
 * the interview — keeps its hold, exactly as a prompt whose stage is never
 * reached keeps the one {@link reservePromptFixedValues} took. Neither refuses
 * a draw anything: a reservation only redirects.
 */
export const releaseRosterValues = (
  handles: SessionHandles,
  stage: NameGeneratorStage,
  assetData: AssetData,
): void => {
  const rows = assetData.rosterNodes?.[stage.id];
  if (rows === undefined) return;
  applyRosterReservations(
    handles,
    { entity: 'node', type: stage.subject.type },
    rows,
    false,
  );
};

/**
 * Whether the network can still take every `unique` value the node built from
 * a roster row would hold.
 *
 * Asked of the assignment that will actually be written — the row merged with
 * the prompt's `additionalAttributes` — rather than of the row as it arrived.
 * Where a prompt's value wins the collision the row's own value is never
 * written, so a check reading the row answers about a value no node ends up
 * holding: it passes over a row the network could still take, and lets through
 * one whose finished node repeats a value the registry has already issued.
 *
 * A row's values are the researcher's rather than the registry's, so nothing
 * stops two rows offering one value for a variable the codebook marks
 * `unique`. A roster is a pool of candidates the run draws a subset of, so a
 * row that would repeat a value already in the network is passed over rather
 * than refused — leaving a row undrawn contradicts nothing the protocol
 * declares.
 *
 * Reservations are not consulted: the whole drawable pool is reserved before a
 * draw begins, so every row would fail a check that read them.
 */
export const rosterRowIsDrawable = (
  { entityConstraints, uniqueRegistry }: SessionHandles,
  scope: EntityScopeRef,
  fixed: Readonly<Record<string, VariableValue>>,
): boolean => {
  const registry = scopeKey(scope);

  for (const [slot, memberIds] of uniqueSlotMembers(
    entityConstraints.forScope(scope),
  )) {
    for (const id of memberIds) {
      const value = fixed[id];
      if (value === undefined || value === null) continue;
      if (uniqueRegistry.isTaken(registry, slot, value)) return false;
    }
  }

  return true;
};

/**
 * Records the `unique` values an entity was given from outside the registry —
 * a roster row's, a prompt's `additionalAttributes`.
 *
 * Nothing was ever issued for them to give back; what is left is to record
 * them. They are in the network, and a later entity issued one as well would
 * be the duplicate `unique` forbids. A group whose members were fixed to
 * values that disagree holds every one of them, so every one is claimed.
 */
export const claimFixedValues = (
  { entityConstraints, uniqueRegistry }: SessionHandles,
  scope: EntityScopeRef,
  fixed: Readonly<Record<string, VariableValue>>,
): void => {
  const registry = scopeKey(scope);

  for (const [slot, memberIds] of uniqueSlotMembers(
    entityConstraints.forScope(scope),
  )) {
    for (const id of memberIds) {
      const value = fixed[id];
      if (value !== undefined && value !== null) {
        uniqueRegistry.claim(registry, slot, value);
      }
    }
  }
};

/**
 * Holds back every `unique` value a prompt's `additionalAttributes` will fix,
 * for the whole session and before any stage draws.
 *
 * A fixed value only reaches the registry when the node carrying it is built,
 * which is too late for the stages that ran first: a boolean `unique` variable
 * drawn on an earlier stage takes the first value of its sequence, a later
 * prompt fixes that same value, and the finished network holds it twice.
 *
 * Every prompt of every name generator is counted, whatever the stage's count
 * turns out to be. The G2 engine weighed each value against the node ceiling
 * its stage could reach, because feasibility read the same tally; feasibility
 * is Phase 4's and reads its own, so what is left here is the hold itself —
 * and a hold taken for a prompt that creates nobody costs a draw nothing.
 */
export const reservePromptFixedValues = (
  { entityConstraints, uniqueRegistry }: SessionHandles,
  stages: readonly Stage[],
): void => {
  for (const stage of stages) {
    if (!isNameGeneratorStage(stage)) continue;

    const scope: EntityScopeRef = { entity: 'node', type: stage.subject.type };
    const registry = scopeKey(scope);
    const slots = uniqueSlotMembers(entityConstraints.forScope(scope));
    if (slots.size === 0) continue;

    for (const prompt of stage.prompts) {
      for (const { variable, value } of prompt.additionalAttributes ?? []) {
        for (const [slot, memberIds] of slots) {
          if (!memberIds.includes(String(variable))) continue;
          uniqueRegistry.reserve(registry, slot, value);
        }
      }
    }
  }
};
