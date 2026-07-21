import type { Stage } from '@codaco/protocol-validation';
import { entityAttributesProperty } from '@codaco/shared-consts';

import type { GenerationContext, NetworkDraft } from './context';
import { getStageFilteredNodes } from './filtering';

/**
 * Variables an in-progress stage would not yet have written for unvisited
 * nodes. Clearing these returns a node to the stage's "unplaced" bucket.
 */
function getInProgressClearableVariables(stage: Stage): string[] {
  if (stage.type === 'OrdinalBin') {
    return stage.prompts.map((p) => p.variable);
  }
  if (stage.type === 'CategoricalBin') {
    // A node only counts as uncategorised when both the prompt variable and any
    // "other" variable are nil, so both are cleared together.
    return stage.prompts.flatMap((p) =>
      p.otherVariable ? [p.variable, p.otherVariable] : [p.variable],
    );
  }
  if (stage.type === 'Sociogram') {
    return stage.prompts.map((p) => p.layout.layoutVariable);
  }
  return [];
}

function getNodeSubjectType(stage: Stage): string | undefined {
  if (!('subject' in stage) || stage.subject.entity !== 'node') {
    return undefined;
  }
  return stage.subject.type;
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
): void {
  const variables = getInProgressClearableVariables(stage);
  if (variables.length === 0) return;

  const nodeType = getNodeSubjectType(stage);
  if (nodeType === undefined) return;

  const subjectNodes = getStageFilteredNodes(ctx, draft, stage, nodeType);
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
  for (const idx of indices.slice(0, clearCount)) {
    const attrs = subjectNodes[idx]![entityAttributesProperty];
    for (const varId of variables) {
      attrs[varId] = null;
    }
  }
}
