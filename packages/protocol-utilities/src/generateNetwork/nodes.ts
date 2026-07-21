import { v4 as uuid } from 'uuid';

import type { AdditionalAttributes } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import { generateAttributes } from './attributes';
import type { GenerationConfig } from './config';
import type { GenerationContext, StageOfType } from './context';
import { getSubjectType } from './subject';

/**
 * Node-subject stages that fabricate nodes: the three name-generator variants
 * and NetworkComposer (a from-scratch builder).
 */
type NodeCreationStage = StageOfType<
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

function getNodeCountBounds(
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
  // A configured minNodes above the max (or above an explicit maxNodes) must not
  // invert the range, or randomInt(min, max) throws and the preview hangs.
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

  for (let i = 0; i < count; i++) {
    const nodeIndex = existingNodeCount + i;
    const attrs = generateAttributes(
      nodeTypeDef.variables,
      ctx.valueGen,
      nodeIndex,
    );

    const takeFromRoster =
      drawn < pool.length &&
      (!roster.allowFabrication ||
        ctx.valueGen.randomFloat(0, 1) < ctx.config.rosterDrawRatio);

    let primaryKey = uuid();

    if (takeFromRoster) {
      const swapIndex = ctx.valueGen.randomInt(drawn, pool.length - 1);
      const picked = pool[swapIndex]!;
      pool[swapIndex] = pool[drawn]!;
      pool[drawn] = picked;
      drawn += 1;

      primaryKey = picked[entityPrimaryKeyProperty];
      roster.used.add(primaryKey);

      const rosterValues = picked[entityAttributesProperty];
      // The roster interface lets the roster value win a collision with a
      // prompt attribute, while a name generator panel lets the prompt win.
      if (roster.allowFabrication) {
        Object.assign(attrs, rosterValues, additionalAttrs);
      } else {
        Object.assign(attrs, additionalAttrs, rosterValues);
      }
    } else {
      Object.assign(attrs, additionalAttrs);
    }

    const node: NcNode = {
      [entityPrimaryKeyProperty]: primaryKey,
      type: nodeType,
      [entityAttributesProperty]: attrs,
      stageId: stage.id,
      promptIDs: [promptId],
    };
    newNodes.push(node);
  }

  return newNodes;
}
