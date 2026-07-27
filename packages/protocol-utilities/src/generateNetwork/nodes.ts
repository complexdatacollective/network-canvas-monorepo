import { v4 as uuid } from 'uuid';

import type { AdditionalAttributes, Stage } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
  type VariableValue,
} from '@codaco/shared-consts';

import type { VariableEntry } from '../types';
import {
  claimFixedValues,
  generateAttributesForEntity,
  releaseRosterValues,
  reserveRosterValues,
  rosterRowIsDrawable,
} from './attributes';
import type { GenerationConfig } from './config';
import type { EntityScopeRef } from './constraints/generateEntityAttributes';
import {
  COMPARATOR_DIRECTION,
  COMPARISON_RULES,
  type EntityConstraints,
} from './constraints/types';
import { valueKey } from './constraints/uniqueRegistry';
import type { GenerationContext, StageOfType } from './context';
import { getSubjectType } from './subject';

/**
 * Node-subject stages that fabricate nodes: the three name-generator variants
 * and NetworkComposer (a from-scratch builder).
 */
export type NodeCreationStage = StageOfType<
  | 'NameGenerator'
  | 'NameGeneratorQuickAdd'
  | 'NameGeneratorRoster'
  | 'NetworkComposer'
>;

/**
 * Minimal prompt shape node creation needs: an id (for `promptIDs`) and any
 * additional attributes to stamp onto created nodes. NetworkComposer, which is
 * promptless, passes a synthetic `{ id }`.
 */
type NodeDrawPrompt = {
  id?: string;
  additionalAttributes?: AdditionalAttributes;
};

/**
 * Roster state for a name-generator stage.
 *
 * `pool` is the stage's unfiltered roster rows; the drawable rows are those in
 * `pool` not already in `used`. Presence of `pool` is load-bearing and
 * three-way: `undefined` means "no roster known" (the stage had no external
 * data entry), an empty array means "roster known to be empty" (the asset
 * resolved and parsed but yielded no rows, or a panel filtered them all out),
 * and a non-empty array is a roster with rows. A `NameGeneratorRoster` stage
 * fabricates only in the first case; a known-empty or exhausted roster produces
 * zero nodes. See `createNodesForStage`.
 */
export type RosterDraw = {
  pool?: NcNode[];
  /** Roster rows already drawn, shared across all prompts and stages. */
  used: Set<string>;
  /** Whether the stage may fabricate nodes beyond the roster. */
  allowFabrication: boolean;
};

function getPromptAdditionalAttributes(
  additional: AdditionalAttributes | undefined,
): Record<string, boolean> {
  if (!additional) return {};
  return additional.reduce<Record<string, boolean>>(
    (acc, { variable, value }) => ({ ...acc, [variable]: value }),
    {},
  );
}

/**
 * The nodes a prompt's `additionalAttributes` can write one value onto, keyed
 * by variable id and then by the value's registry key. See
 * {@link countPromptFixedValues}.
 */
type FixedValueTally = { value: boolean; count: number };

export type PromptFixedValues = Map<string, Map<string, FixedValueTally>>;

/** The name-generator variants, the only stages whose prompts fix a value. */
type PromptedNodeStage = StageOfType<
  'NameGenerator' | 'NameGeneratorQuickAdd' | 'NameGeneratorRoster'
>;

function isPromptedNodeStage(stage: Stage): stage is PromptedNodeStage {
  return (
    stage.type === 'NameGenerator' ||
    stage.type === 'NameGeneratorQuickAdd' ||
    stage.type === 'NameGeneratorRoster'
  );
}

/**
 * How many nodes of each type a prompt's `additionalAttributes` can write each
 * of its values onto, keyed by node type.
 *
 * A prompt writes its additional attributes onto every node it creates, so
 * unlike a drawn value this one cannot vary with the seed — which makes it
 * decidable before any drawing whether more nodes than a `unique` variable
 * allows are going to end up holding it. Counted at each stage's node ceiling,
 * for the same reason the rest of feasibility counts worst cases.
 *
 * The ceiling belongs to the stage rather than to each of its prompts:
 * `createNodesForStage` counts every prompt of a stage against the same
 * `maxNodes`, so a stage allowed one node creates one node however many of its
 * prompts fix the value, and summing each prompt's independent maximum would
 * refuse a protocol that generates perfectly well. Stages are summed against
 * each other, because a `unique` value is claimed once for the whole run.
 *
 * A roster stage is the one place a prompt's value can fail to land: the row's
 * own value for the variable wins there (see `createNodesForStage`), so only
 * the rows leaving it unset are counted.
 */
export function countPromptFixedValues(
  stages: Stage[],
  config: GenerationConfig,
  externalData: Record<string, NcNode[]> | undefined,
): Map<string, PromptFixedValues> {
  const byType = new Map<string, PromptFixedValues>();

  for (const stage of stages) {
    if (!isPromptedNodeStage(stage)) continue;

    const nodeType = getSubjectType(stage.subject, 'node');
    if (nodeType === undefined) continue;

    const { maxNodes } = getNodeCountBounds(stage, config);
    const pool =
      stage.type === 'NameGeneratorRoster'
        ? externalData?.[stage.id]
        : undefined;

    const forStage: PromptFixedValues = new Map();

    for (const prompt of stage.prompts) {
      for (const { variable, value } of prompt.additionalAttributes ?? []) {
        const carriers = pool
          ? Math.min(
              maxNodes,
              pool.filter(
                (row) => row[entityAttributesProperty][variable] === undefined,
              ).length,
            )
          : maxNodes;
        if (carriers === 0) continue;

        const forVariable =
          forStage.get(variable) ?? new Map<string, FixedValueTally>();
        // Keyed as the registry keys it, so this counts the same values the
        // registry would judge equal.
        const key = valueKey(value);
        forVariable.set(key, {
          value,
          // The most this stage can spend, not the sum of what its prompts
          // could each spend alone: they share the stage's capacity.
          count: Math.max(forVariable.get(key)?.count ?? 0, carriers),
        });
        forStage.set(variable, forVariable);
      }
    }

    if (forStage.size === 0) continue;

    const forType: PromptFixedValues = byType.get(nodeType) ?? new Map();
    for (const [variable, values] of forStage) {
      const running =
        forType.get(variable) ?? new Map<string, FixedValueTally>();
      for (const [key, { value, count }] of values) {
        running.set(key, {
          value,
          count: (running.get(key)?.count ?? 0) + count,
        });
      }
      forType.set(variable, running);
    }
    byType.set(nodeType, forType);
  }

  return byType;
}

/**
 * The values one prompt's `additionalAttributes` write onto every node it
 * creates, keyed by node type, for the prompts whose whole set is certain to
 * land together.
 *
 * A rule with both of its ends fixed leaves the draw nothing to choose, so the
 * pair either satisfies the rule as the protocol states it or nothing can make
 * it — which is decidable before any drawing. Prompts fixing fewer than two
 * variables are left out: no rule can span a single fixed value and something
 * the draw is still free to choose for it.
 *
 * A roster stage holding rows is left out too. A row's own value wins over the
 * prompt's there, so which of a prompt's values reach one node depends on the
 * row drawn — data rather than protocol, settled at the draw by passing the row
 * over. A roster stage with no rows fabricates every node it makes, so its
 * prompt's values all land and it is counted here like any other.
 */
export function collectPromptFixedAssignments(
  stages: Stage[],
  externalData: Record<string, NcNode[]> | undefined,
): Map<string, Record<string, VariableValue>[]> {
  const byType = new Map<string, Record<string, VariableValue>[]>();

  for (const stage of stages) {
    if (!isPromptedNodeStage(stage)) continue;
    if (
      stage.type === 'NameGeneratorRoster' &&
      externalData?.[stage.id] !== undefined
    ) {
      continue;
    }

    const nodeType = getSubjectType(stage.subject, 'node');
    if (nodeType === undefined) continue;

    for (const prompt of stage.prompts) {
      const additional = prompt.additionalAttributes ?? [];
      if (additional.length < 2) continue;

      const values: Record<string, VariableValue> = {};
      for (const { variable, value } of additional) values[variable] = value;

      const forType = byType.get(nodeType) ?? [];
      forType.push(values);
      byType.set(nodeType, forType);
    }
  }

  return byType;
}

/** A rule an entity's fixed values break, as the pair that breaks it. */
export type BrokenFixedRule = {
  /** Both ends of the rule, in the order the codebook declares them. */
  variableIds: string[];
  /** The fixed values those variables hold, in the same order. */
  values: VariableValue[];
  rule: string;
};

/**
 * Whether a comparator holds between two values neither of which is drawn.
 *
 * Read the way `applyComparatorBounds` reads a counterpart it is drawing
 * against: a datetime against a date string, anything else against a number,
 * and a pair it cannot order left alone rather than judged. Dates compare as
 * strings, which is how the runtime's own min/max validators compare them.
 */
function comparatorHolds(
  entry: VariableEntry,
  own: VariableValue,
  other: VariableValue,
  { ownerIsUpper, strict }: { ownerIsUpper: boolean; strict: boolean },
): boolean {
  if (entry.type === 'datetime') {
    if (typeof own !== 'string' || own === '') return true;
    if (typeof other !== 'string' || other === '') return true;
    const [upper, lower] = ownerIsUpper ? [own, other] : [other, own];
    return strict ? upper > lower : upper >= lower;
  }

  const ownNumber = Number(own);
  const otherNumber = Number(other);
  if (Number.isNaN(ownNumber) || Number.isNaN(otherNumber)) return true;

  const [upper, lower] = ownerIsUpper
    ? [ownNumber, otherNumber]
    : [otherNumber, ownNumber];
  return strict ? upper > lower : upper >= lower;
}

/**
 * The first rule an entity's fixed values break between two of themselves, if
 * any.
 *
 * A value put on an entity rather than drawn for it — a roster row's, a
 * prompt's `additionalAttributes` — is generated around rather than chosen, so
 * a rule with one fixed end and one drawn end is resolved by the draw. A rule
 * with both ends fixed is not: nothing is left to choose, and the assignment
 * either satisfies it or no generation can. That has to be judged before the
 * assignment is accepted, because the draw is asked only for the variables the
 * fixed values leave over and never sees the pair at all.
 *
 * A value that is absent or null is passed over, as the draw passes over a null
 * counterpart: a rule needs two values to be broken by.
 */
export function ruleBrokenByFixedValues(
  entity: EntityConstraints,
  fixed: Record<string, VariableValue>,
): BrokenFixedRule | undefined {
  const declared = [...entity.keys()];
  const held = (id: string): VariableValue | undefined => {
    const value = fixed[id];
    return value === null ? undefined : value;
  };

  for (const [id, { constraints, entry }] of entity) {
    const own = held(id);
    if (own === undefined) continue;

    const broken = (
      target: string,
      rule: string,
      other: VariableValue,
    ): BrokenFixedRule => {
      const targetFirst = declared.indexOf(target) < declared.indexOf(id);
      return {
        variableIds: targetFirst ? [target, id] : [id, target],
        values: targetFirst ? [other, own] : [own, other],
        rule,
      };
    };

    const { sameAs, differentFrom } = constraints;

    if (sameAs !== undefined) {
      const other = held(sameAs);
      if (other !== undefined && valueKey(other) !== valueKey(own)) {
        return broken(sameAs, 'sameAs', other);
      }
    }

    if (differentFrom !== undefined) {
      const other = held(differentFrom);
      if (other !== undefined && valueKey(other) === valueKey(own)) {
        return broken(differentFrom, 'differentFrom', other);
      }
    }

    for (const rule of COMPARISON_RULES) {
      const target = constraints[rule];
      if (target === undefined) continue;
      const other = held(target);
      if (other === undefined) continue;
      if (!comparatorHolds(entry, own, other, COMPARATOR_DIRECTION[rule])) {
        return broken(target, rule, other);
      }
    }
  }

  return undefined;
}

/**
 * Takes a roster row the run can use from the drawable window `pool[from..]`,
 * swapping it into `pool[from]` so drawn rows stay behind the window.
 *
 * The starting point is random, as an undrawn pool is drawn in random order,
 * and the search walks on from there — so a pool with nothing to pass over
 * consumes exactly the one random number it always did, and picks exactly the
 * row it always did. `undefined` means the window holds no row the network can
 * still take, which is a roster whose remaining values are all spoken for or
 * whose remaining rows all break a rule between values nothing draws.
 */
function takeDrawableRosterRow(
  ctx: GenerationContext,
  scope: EntityScopeRef,
  pool: NcNode[],
  from: number,
  rulesAllow: (row: NcNode) => boolean,
): NcNode | undefined {
  const window = pool.length - from;
  if (window <= 0) return undefined;

  const start = ctx.valueGen.randomInt(from, pool.length - 1);

  for (let step = 0; step < window; step++) {
    const index = from + ((start - from + step) % window);
    const candidate = pool[index]!;
    if (!rosterRowIsDrawable(ctx, scope, candidate)) continue;
    if (!rulesAllow(candidate)) continue;

    pool[index] = pool[from]!;
    pool[from] = candidate;
    return candidate;
  }

  return undefined;
}

export function getNodeCountBounds(
  stage: NodeCreationStage,
  config: GenerationConfig,
): { minNodes: number; maxNodes: number } {
  const behaviours = 'behaviours' in stage ? stage.behaviours : undefined;
  const minNodes =
    behaviours && 'minNodes' in behaviours && behaviours.minNodes !== undefined
      ? behaviours.minNodes
      : config.nodeCount.min;
  const maxNodes =
    behaviours && 'maxNodes' in behaviours && behaviours.maxNodes !== undefined
      ? behaviours.maxNodes
      : config.nodeCount.max;
  // A configured minNodes above the max is honoured by raising the ceiling to
  // meet it. `maxNodes` is also the stage's capacity, so leaving the range
  // inverted would clamp the stage below the minimum the protocol asks for.
  return { minNodes, maxNodes: Math.max(maxNodes, minNodes) };
}

export function createNodesForStage(
  ctx: GenerationContext,
  stage: NodeCreationStage,
  prompt: NodeDrawPrompt,
  existingNodeCount: number,
  stageNodeCount: number,
  roster: RosterDraw,
): NcNode[] {
  const nodeType = getSubjectType(stage.subject, 'node');
  if (nodeType === undefined) return [];

  const nodeTypeDef = ctx.codebook.node?.[nodeType];
  if (!nodeTypeDef) return [];

  const { minNodes, maxNodes } = getNodeCountBounds(stage, ctx.config);
  const remaining = maxNodes - stageNodeCount;
  if (remaining <= 0) return [];

  // "Has a roster" means the stage was given a roster entry at all — the key is
  // present — regardless of how many rows it holds. This three-way distinction
  // drives NameGeneratorRoster fallback: no entry (`pool` undefined) fabricates;
  // an entry that is empty (roster known empty) or exhausted by an earlier stage
  // (drawable pool empty) produces zero nodes. The drawable pool below excludes
  // rows already used.
  const hasRoster = roster.pool !== undefined;

  const pool = roster.pool
    ? roster.pool.filter((n) => !roster.used.has(n[entityPrimaryKeyProperty]))
    : [];

  const requested = Math.min(
    ctx.valueGen.randomInt(minNodes, maxNodes),
    remaining,
  );
  const count =
    hasRoster && !roster.allowFabrication
      ? Math.min(requested, pool.length)
      : requested;

  const promptId = prompt.id ?? uuid();
  const additionalAttrs = getPromptAdditionalAttributes(
    prompt.additionalAttributes,
  );
  const newNodes: NcNode[] = [];
  let drawn = 0;

  const scope = { entity: 'node', type: nodeType } as const;
  const variableIds = Object.keys(nodeTypeDef.variables ?? {});
  const constraints: EntityConstraints =
    ctx.entityConstraints.node.get(nodeType) ?? new Map();

  /** Every value the node is given rather than drawn, settled before the draw. */
  const fixedValuesFor = (
    row: NcNode | undefined,
  ): Record<string, VariableValue> => {
    if (row === undefined) return { ...additionalAttrs };

    const rosterValues = row[entityAttributesProperty];
    // The roster interface lets the roster value win a collision with a
    // prompt attribute, while a name generator panel lets the prompt win.
    return roster.allowFabrication
      ? { ...rosterValues, ...additionalAttrs }
      : { ...additionalAttrs, ...rosterValues };
  };

  reserveRosterValues(ctx, scope, pool);

  for (let i = 0; i < count; i++) {
    const nodeIndex = existingNodeCount + i;

    const wantsRosterRow =
      drawn < pool.length &&
      (!roster.allowFabrication ||
        ctx.valueGen.randomFloat(0, 1) < ctx.config.rosterDrawRatio);
    const picked = wantsRosterRow
      ? takeDrawableRosterRow(
          ctx,
          scope,
          pool,
          drawn,
          // A row whose values break a rule between two of them, or between one
          // of them and a value the prompt fixes, is passed over exactly as one
          // repeating a `unique` value is: no draw stands between those values
          // and the finished node, so the row is simply not one this protocol
          // can use. Refusing instead would fail a roster of hundreds over rows
          // the draw might never have reached.
          (row) =>
            ruleBrokenByFixedValues(constraints, fixedValuesFor(row)) ===
            undefined,
        )
      : undefined;

    // A roster stage builds nodes only from rows, so a pool holding none the
    // network can still take ends the stage — the alternative would be
    // fabricating a person for a stage whose people all come from the roster.
    if (wantsRosterRow && picked === undefined && !roster.allowFabrication) {
      break;
    }

    let primaryKey = uuid();
    const fixed = fixedValuesFor(picked);

    if (picked) {
      drawn += 1;

      primaryKey = picked[entityPrimaryKeyProperty];
      roster.used.add(primaryKey);
    }

    // A roster row and a prompt's `additionalAttributes` settle their variables
    // before anything is drawn, so the rest of the node is generated around the
    // values it actually ends up holding. Generating first and overwriting
    // after would leave a `sameAs`, `differentFrom` or comparator spanning a
    // fixed and a drawn variable broken on the finished node.
    const hasFixed = Object.keys(fixed).length > 0;
    const generated = generateAttributesForEntity(
      ctx,
      scope,
      nodeIndex,
      hasFixed
        ? {
            existing: fixed,
            only: new Set(variableIds.filter((id) => !(id in fixed))),
          }
        : undefined,
    );

    const attrs = { ...generated, ...fixed };
    if (hasFixed) claimFixedValues(ctx, scope, fixed);

    const node: NcNode = {
      [entityPrimaryKeyProperty]: primaryKey,
      type: nodeType,
      [entityAttributesProperty]: attrs,
      stageId: stage.id,
      promptIDs: [promptId],
    };
    newNodes.push(node);
  }

  // Rows left in the pool are drawable by a later prompt or stage, which
  // reserves them again; holding the reservation open past this draw would keep
  // their values from nodes no roster row is waiting for.
  releaseRosterValues(ctx, scope, pool);

  return newNodes;
}
