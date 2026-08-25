import { z } from 'zod';

import type {
  CurrentProtocol,
  Stage,
  Variable,
} from '@codaco/protocol-validation';
import {
  entityPrimaryKeyProperty,
  VariableValueSchema,
  type VariableValue,
} from '@codaco/shared-consts';

import type { ConstraintConflict } from '../constraints/error';
import { SyntheticDataConstraintError } from '../constraints/error';
import { crossRuleBrokenByFixedValues } from '../constraints/fixedValueRules';
import {
  type EntityScopeRef,
  generateEntityAttributes,
  scopeKey,
  uniqueSlotMembers,
} from '../constraints/generateEntityAttributes';
import { claimFixedValues } from '../constraints/reservations';
import type { EntityConstraints } from '../constraints/types';
import { valueKey } from '../constraints/uniqueRegistry';
import { toVariableEntry } from '../constraints/variableEntry';
import {
  composerRenderedCodebook,
  renderedConstraintsFor,
} from '../simulators/shared/composerValues';
import { generationFor } from '../simulators/shared/stageContext';
import type { SimulationContext } from '../simulators/types';
import { invariant } from '../utils/invariant';

/**
 * The fixture channel: a caller stating outright what a participant did, per
 * stage (spec: builder succession). A stage with node entries here does not
 * simulate — its output is the entries, applied through the engine's own
 * primitives — because the caller is not asking what a participant WOULD have
 * done there; they are telling the run what this one did. Everything else in
 * the session (the other stages, the clock, the ids, the constraint
 * bookkeeping) stays the walk's.
 *
 * Explicit attribute values are the caller's own and land verbatim, bounds and
 * all: putting chosen data in front of an interface — data a participant could
 * not have entered included — is what the channel is for. What IS refused, up
 * front and on every seed, is a set of fixed values no assignment honours: a
 * cross-variable rule its own pair breaks, or a `unique` value fixed onto two
 * entities (`refuseOverrideConflicts`). The remaining declared variables of a
 * non-manual entry are drawn around the fixed ones through the session's
 * constraint machinery; a `manual` entry is drawn for nothing and keeps
 * neutral values instead, so a hand-built scenario is not corrupted by random
 * data.
 */

const nodeOverrideEntrySchema = z.strictObject({
  /** The codebook node type the entry materialises. */
  type: z.string().min(1),
  /** The entity's id; minted from the session's id stream when absent. */
  uid: z.string().min(1).optional(),
  /**
   * The stage prompt the entity belongs to. Absent, the entity is created
   * under no prompt at all — a network fixture rather than a nomination.
   */
  promptIndex: z.number().int().min(0).optional(),
  /** Values fixed by the caller; everything else is drawn (or neutral). */
  attributes: z.record(z.string(), VariableValueSchema.nullable()).optional(),
  /** Variables kept absent outright, suppressing their draw. */
  suppress: z.array(z.string()).optional(),
  /**
   * A fully hand-built entity: nothing is drawn for it, and unset declared
   * variables take their neutral value (boolean false, text '', …) rather
   * than a random one.
   */
  manual: z.boolean().optional(),
});

const edgeOverrideEntrySchema = z.strictObject({
  type: z.string().min(1),
  uid: z.string().min(1).optional(),
  /**
   * Endpoint node uids. An edge whose endpoint never materialised (a stopAt
   * run that ended before the owning stage) is skipped rather than refused:
   * the participant never made it.
   */
  from: z.string().min(1),
  to: z.string().min(1),
  attributes: z.record(z.string(), VariableValueSchema.nullable()).optional(),
  suppress: z.array(z.string()).optional(),
  manual: z.boolean().optional(),
});

export const sessionOverridesSchema = z.strictObject({
  /** Stage-id keyed: each listed stage's creation output, predetermined. */
  nodes: z.record(z.string(), z.array(nodeOverrideEntrySchema)).optional(),
  /** Relationships applied once the walk ends, endpoints permitting. */
  edges: z.array(edgeOverrideEntrySchema).optional(),
});

export type SessionOverrides = z.infer<typeof sessionOverridesSchema>;
export type NodeOverrideEntry = z.infer<typeof nodeOverrideEntrySchema>;
export type EdgeOverrideEntry = z.infer<typeof edgeOverrideEntrySchema>;

const FIXED_VALUE_SUMMARY =
  "this interview fixes values that its protocol's rules do not allow";

type OverrideEntry = NodeOverrideEntry | EdgeOverrideEntry;
type EntityOverrideScope = Extract<EntityScopeRef, { entity: 'node' | 'edge' }>;

function declaredVariablesFor(
  codebook: CurrentProtocol['codebook'],
  scope: EntityOverrideScope,
): Record<string, Variable> {
  return codebook[scope.entity]?.[scope.type]?.variables ?? {};
}

function conflictFor(
  codebook: CurrentProtocol['codebook'],
  scope: EntityOverrideScope,
  variableIds: string[],
  rules: string[],
  reason: string,
): ConstraintConflict {
  const definition = codebook[scope.entity]?.[scope.type];
  const variables = definition?.variables ?? {};
  return {
    entity: scope.entity,
    entityType: scope.type,
    ...(definition?.name !== undefined
      ? { entityTypeName: definition.name }
      : {}),
    variableIds,
    variableNames: variableIds.map((id) => variables[id]?.name ?? id),
    rules,
    reason,
  };
}

/**
 * The caller's values for an entry, restricted to the type's declared
 * variables — an attribute no variable declares has no rules to satisfy and
 * no place in the network, so it is passed over exactly as the old builder's
 * `explicitValuesOf` passed it over. A written null suppresses rather than
 * fixes: the caller settled the variable, and no value of it is stored.
 */
function fixedValuesOf(
  entry: OverrideEntry,
  declared: Record<string, Variable>,
): Record<string, VariableValue> {
  const fixed: Record<string, VariableValue> = {};
  const suppressed = new Set(entry.suppress ?? []);
  for (const [id, value] of Object.entries(entry.attributes ?? {})) {
    if (!(id in declared) || suppressed.has(id)) continue;
    if (value === null || value === undefined) continue;
    fixed[id] = value;
  }
  return fixed;
}

function entriesByScope(
  overrides: SessionOverrides,
): [EntityOverrideScope, OverrideEntry][] {
  const listed: [EntityOverrideScope, OverrideEntry][] = [];
  for (const entries of Object.values(overrides.nodes ?? {})) {
    for (const entry of entries) {
      listed.push([{ entity: 'node', type: entry.type }, entry]);
    }
  }
  for (const entry of overrides.edges ?? []) {
    listed.push([{ entity: 'edge', type: entry.type }, entry]);
  }
  return listed;
}

/**
 * The up-front refusal (spec: contradictions refuse before anything draws, as
 * the builder refused): a pair of fixed values on one entity that a rule
 * between them cannot hold, a `unique` value fixed onto two entities of one
 * scope, or an entry naming a stage or prompt the protocol does not have.
 *
 * Duplicates are judged against what earlier entries fixed rather than per
 * variable, because variables held equal by `sameAs` are issued from one
 * slot: a single entity setting every member of such a group to one value
 * spends one claim between them and is no duplicate.
 */
export function refuseOverrideConflicts(
  overrides: SessionOverrides,
  stages: readonly Stage[],
  context: SimulationContext,
): void {
  const { codebook } = context.protocol;
  const stagesById = new Map(stages.map((stage) => [stage.id, stage]));

  for (const [stageId, entries] of Object.entries(overrides.nodes ?? {})) {
    const stage = stagesById.get(stageId);
    invariant(
      stage,
      `overrides name stage "${stageId}", which is not one of the protocol's stages`,
    );
    for (const entry of entries) {
      if (entry.promptIndex === undefined) continue;
      const prompts = 'prompts' in stage ? stage.prompts : undefined;
      invariant(
        prompts?.[entry.promptIndex],
        `overrides reference prompt index ${entry.promptIndex} on stage "${stageId}", but no such prompt exists`,
      );
    }
  }

  // A type the codebook does not declare, or an explicit id used twice, is a
  // caller error the walk would otherwise discover only after it had begun —
  // the engine's addNode/addEdge throw on the second id, and an unknown type
  // materialises an entity no selector or export can describe. Refused here,
  // before anything draws, like every other override contradiction. Nodes and
  // edges keep separate id spaces, exactly as the network stores them.
  const seenIds = { node: new Set<string>(), edge: new Set<string>() };
  for (const [scope, entry] of entriesByScope(overrides)) {
    invariant(
      codebook[scope.entity]?.[scope.type] !== undefined,
      `overrides declare a ${scope.entity} of type "${scope.type}", which the codebook does not define`,
    );
    if (entry.uid === undefined) continue;
    invariant(
      !seenIds[scope.entity].has(entry.uid),
      `overrides declare two ${scope.entity}s with the id "${entry.uid}" — every explicit uid must be unique`,
    );
    seenIds[scope.entity].add(entry.uid);
  }

  // Claims already spent, per scope and slot — a local tally rather than the
  // session registry, because this runs before anything has drawn.
  const spent = new Map<string, Set<string>>();

  for (const [scope, entry] of entriesByScope(overrides)) {
    const constraints = context.entityConstraints.forScope(scope);
    const fixed = fixedValuesOf(entry, declaredVariablesFor(codebook, scope));

    const broken = crossRuleBrokenByFixedValues(constraints, fixed);
    if (broken !== undefined) {
      const setTo = broken.values
        .map((value) => (value === null ? 'null' : valueKey(value)))
        .join(' and ');
      throw new SyntheticDataConstraintError(
        [
          conflictFor(
            codebook,
            scope,
            broken.variableIds,
            [broken.rule],
            `the caller sets these variables on one ${scope.entity} to ${setTo}, which ${broken.rule} cannot hold`,
          ),
        ],
        FIXED_VALUE_SUMMARY,
      );
    }

    const registry = scopeKey(scope);
    for (const [slot, memberIds] of uniqueSlotMembers(constraints)) {
      const slotKey = `${registry} ${slot}`;
      const slotSpent = spent.get(slotKey) ?? new Set<string>();
      const own = new Set<string>();
      for (const id of memberIds) {
        const value = fixed[id];
        if (value === undefined) continue;
        const key = valueKey(value);
        if (slotSpent.has(key)) {
          throw new SyntheticDataConstraintError(
            [
              conflictFor(
                codebook,
                scope,
                [...memberIds],
                ['unique'],
                `the caller sets ${memberIds.length > 1 ? 'these variables, which are held equal,' : 'this'} to ${key} on two ${scope.entity}s, but unique allows one ${scope.entity} to hold a value`,
              ),
            ],
            FIXED_VALUE_SUMMARY,
          );
        }
        own.add(key);
      }
      for (const key of own) slotSpent.add(key);
      spent.set(slotKey, slotSpent);
    }
  }
}

/**
 * Holds back every `unique` value the overrides fix, before any stage draws —
 * the same hold `reservePromptFixedValues` takes for a prompt's fixed values,
 * for the same reason: a draw on an earlier stage must not take the value a
 * later entry arrives holding.
 */
export function reserveOverrideFixedValues(
  overrides: SessionOverrides,
  context: SimulationContext,
): void {
  const { codebook } = context.protocol;
  for (const [scope, entry] of entriesByScope(overrides)) {
    const registry = scopeKey(scope);
    const fixed = fixedValuesOf(entry, declaredVariablesFor(codebook, scope));
    for (const [slot, memberIds] of uniqueSlotMembers(
      context.entityConstraints.forScope(scope),
    )) {
      for (const id of memberIds) {
        const value = fixed[id];
        if (value === undefined) continue;
        context.uniqueRegistry.reserve(registry, slot, value);
      }
    }
  }
}

export type OverridesApplier = {
  /**
   * Apply a visited stage's predetermined entries, honouring a
   * `stopAt.promptIndex` bound the way a simulator does (0 means the
   * participant arrived and did nothing). Returns false when the stage has no
   * entries, telling the walk to simulate as usual.
   */
  applyStage: (stage: Stage, promptBound: number | undefined) => boolean;
  /**
   * Apply every predetermined relationship whose endpoints have materialised
   * and which has not been applied yet. The walk calls this after each stage
   * it completes — a fixture edge exists from the moment both its people do,
   * so the stage filters and skip logic that follow read a network where the
   * relationship is present rather than one it is falsely absent from — and
   * once more when the walk ends, which is what catches endpoints the final
   * stage produced. Entries whose endpoints never materialise (a stopAt run
   * that ended before the owning stage) are simply never applied: the
   * participant never made them.
   */
  applyEdges: (currentStep: number) => void;
};

export function createOverridesApplier(
  overrides: SessionOverrides,
  context: SimulationContext,
): OverridesApplier {
  const { engine } = context;
  const { codebook } = context.protocol;
  // One sequence over every entry, so what an entry draws depends on its place
  // in the fixture rather than on which stages the route happened to visit.
  let drawIndex = 0;

  // Overridden entities draw against the composer-rendered codebook, exactly
  // as the NetworkComposer simulator does: a fixture node on a composer stage
  // must not be handed a date its own inspector rejects. Computing it here
  // also refuses a protocol whose reachable forms render one value through
  // incompatible controls before anything is applied.
  const rendered = composerRenderedCodebook(
    codebook,
    context.protocol.stages,
    context.today,
  );
  const renderedConstraints = new Map<string, EntityConstraints>();
  const constraintsFor = (scope: EntityOverrideScope): EntityConstraints => {
    const key = scopeKey(scope);
    const hit = renderedConstraints.get(key);
    if (hit) return hit;
    const built = renderedConstraintsFor({
      codebook: rendered,
      scope,
      today: context.today,
      interfaceRules: context.interfaceRules,
    });
    renderedConstraints.set(key, built);
    return built;
  };

  const materialise = (
    scope: EntityOverrideScope,
    entry: OverrideEntry,
  ): { uid: string; attributes: Record<string, VariableValue> } => {
    const declared = declaredVariablesFor(codebook, scope);
    const fixed = fixedValuesOf(entry, declared);
    const suppressed = new Set(entry.suppress ?? []);
    for (const [id, value] of Object.entries(entry.attributes ?? {})) {
      if (value === null || value === undefined) suppressed.add(id);
    }
    const unset = Object.keys(declared).filter(
      (id) => !(id in fixed) && !suppressed.has(id),
    );

    const attributes: Record<string, VariableValue> = {};
    if (entry.manual) {
      for (const id of unset) {
        const definition = declared[id];
        if (definition === undefined) continue;
        const neutral = context.valueGen.neutralForVariable(
          toVariableEntry(id, definition),
        );
        if (neutral !== undefined) attributes[id] = neutral;
      }
    } else {
      Object.assign(
        attributes,
        generateEntityAttributes(
          constraintsFor(scope),
          generationFor(context),
          scope,
          drawIndex,
          { existing: fixed, only: new Set(unset) },
        ),
      );
    }
    Object.assign(attributes, fixed);
    drawIndex += 1;

    claimFixedValues(context, scope, fixed);
    return { uid: entry.uid ?? context.streams.uuid(), attributes };
  };

  return {
    applyStage: (stage, promptBound) => {
      const entries = overrides.nodes?.[stage.id];
      if (entries === undefined) return false;

      const currentStep = context.protocol.stages.findIndex(
        (candidate) => candidate.id === stage.id,
      );
      const promptCount = 'prompts' in stage ? stage.prompts.length : 0;

      const worked =
        promptBound === undefined
          ? entries
          : entries.filter((entry) => (entry.promptIndex ?? 0) < promptBound);

      for (const entry of worked) {
        // The engine stamps the CURRENT prompt onto a node, so the entry's
        // prompt is selected first; an entry pinned to no prompt selects an
        // index past the stage's list, which stamps none.
        engine.updatePrompt({
          promptIndex: entry.promptIndex ?? promptCount,
        });
        const { uid, attributes } = materialise(
          { entity: 'node', type: entry.type },
          entry,
        );
        engine.addNode({
          nodeType: entry.type,
          uid,
          attributeData: attributes,
          currentStep,
        });
      }
      engine.updatePrompt({ promptIndex: 0 });
      return true;
    },

    applyEdges: (() => {
      const applied = new Set<EdgeOverrideEntry>();
      return (currentStep: number) => {
        const materialised = new Set(
          engine.draft.network.nodes.map(
            (node) => node[entityPrimaryKeyProperty],
          ),
        );
        for (const entry of overrides.edges ?? []) {
          if (applied.has(entry)) continue;
          if (!materialised.has(entry.from) || !materialised.has(entry.to)) {
            continue;
          }
          applied.add(entry);
          const { uid, attributes } = materialise(
            { entity: 'edge', type: entry.type },
            entry,
          );
          engine.addEdge({
            edgeType: entry.type,
            uid,
            from: entry.from,
            to: entry.to,
            attributeData: attributes,
            currentStep,
          });
        }
      };
    })(),
  };
}
