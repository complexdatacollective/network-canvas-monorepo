import { getStageLayoutUses, type Stage } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import type { GenerationContext, NetworkDraft } from './context.ts';
import { getStageFilteredNodes } from './filtering.ts';
import { getStageNodeTypes } from './subject.ts';

/** Keep only string entries, dropping the `undefined` a half-built prompt yields. */
function onlyStrings(values: (string | undefined)[]): string[] {
  return values.filter((value): value is string => typeof value === 'string');
}

/**
 * Variables an in-progress stage would not yet have written for unvisited
 * nodes. Clearing these returns a node to the stage's "unplaced" bucket.
 *
 * markStageInProgress runs on the in-progress stage — in Architect previews the
 * stage being edited, so its prompts can be half-built (missing `variable` or
 * `layout`) even though the schema types mark those fields required. Each field
 * is re-derived at runtime and non-strings are filtered out, so no `undefined`
 * key ever reaches the attribute object.
 */
function getInProgressClearableVariables(
  stage: Stage,
  earlierStages: readonly Stage[],
): string[] {
  if (stage.type === 'OrdinalBin') {
    return onlyStrings(
      (stage.prompts ?? []).map((p): string | undefined => p.variable),
    );
  }
  if (stage.type === 'CategoricalBin') {
    // A node only counts as uncategorised when both the prompt variable and any
    // "other" variable are nil, so both are cleared together.
    return onlyStrings(
      (stage.prompts ?? []).flatMap((p): (string | undefined)[] => [
        p.variable,
        p.otherVariable,
      ]),
    );
  }
  if (stage.type === 'Sociogram') {
    const layout: string | undefined = stage.layout;
    // Only a stage where the participant places nodes by hand leaves some in
    // the drawer, and only when no earlier stage has placed them already.
    const prompts = stage.prompts ?? [];
    const placesByHand =
      stage.behaviours?.automaticLayout !== true &&
      prompts.some((prompt) => prompt.task === 'layout');
    const placedEarlier = earlierStages.some((earlier) =>
      getStageLayoutUses(earlier).some(
        (use) => use.layoutId === layout && use.access === 'sets',
      ),
    );
    return placesByHand && !placedEarlier ? onlyStrings([layout]) : [];
  }
  return [];
}

/**
 * Clears the stage's prompt variables on a fraction of its subject nodes
 * (always at least one) so the stage presents as partially complete: some
 * nodes already placed, others still awaiting interaction.
 */
export function markStageInProgress(
  ctx: GenerationContext,
  draft: NetworkDraft,
  stage: Stage,
  earlierStages: readonly Stage[],
): void {
  const variables = getInProgressClearableVariables(stage, earlierStages);
  if (variables.length === 0) return;

  // A Sociogram can show several node types; its unplaced nodes come from all of them.
  const subjectNodes = (getStageNodeTypes(stage) ?? []).flatMap((nodeType) =>
    getStageFilteredNodes(ctx, draft, stage, nodeType),
  );
  if (subjectNodes.length === 0) return;

  const indices = subjectNodes.map((_, idx) => idx);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = ctx.valueGen.randomInt(0, i);
    [indices[i], indices[j]] = [indices[j]!, indices[i]!];
  }

  const clearCount = Math.max(
    1,
    Math.floor(subjectNodes.length * ctx.config.inProgressClearRatio),
  );
  const cleared = indices.slice(0, clearCount).map((idx) => subjectNodes[idx]!);
  for (const node of cleared) {
    const attrs = node[entityAttributesProperty];
    for (const varId of variables) {
      delete attrs[varId];
    }
  }
  if (stage.type === 'Sociogram') {
    undoSociogramTasksOnUnplaced(draft, stage, cleared);
  }
}

/**
 * A node returned to the drawer cannot have been connected or highlighted by
 * the stage's later tasks, which act only on placed nodes, so the stage's own
 * writes on it are undone. What other stages wrote stays.
 */
function undoSociogramTasksOnUnplaced(
  draft: NetworkDraft,
  stage: Extract<Stage, { type: 'Sociogram' }>,
  unplaced: readonly NetworkDraft['nodes'][number][],
): void {
  const writes = draft.sociogramWrites.get(stage.id);
  if (writes === undefined) return;

  const unplacedIds = new Set(
    unplaced.map((node) => node[entityPrimaryKeyProperty]),
  );
  const undone = new Set(
    writes.edges.filter(
      (edge) => unplacedIds.has(edge.from) || unplacedIds.has(edge.to),
    ),
  );
  draft.edges = draft.edges.filter((edge) => !undone.has(edge));

  for (const node of unplaced) {
    const attributes = node[entityAttributesProperty];
    for (const [key, { before, written }] of writes.attributes.get(node) ??
      []) {
      // A later stage that wrote the variable again keeps its value.
      if (attributes[key] !== written) continue;
      if (before === undefined) {
        delete attributes[key];
      } else {
        attributes[key] = before;
      }
    }
  }
}
