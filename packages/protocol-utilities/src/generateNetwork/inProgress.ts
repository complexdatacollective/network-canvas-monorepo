import type { Stage } from '@codaco/protocol-validation';
import { entityAttributesProperty } from '@codaco/shared-consts';

import type { GenerationContext, NetworkDraft } from './context';
import { getStageFilteredNodes } from './filtering';

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
function getInProgressClearableVariables(stage: Stage): string[] {
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
    return onlyStrings(
      (stage.prompts ?? []).map((p): string | undefined => {
        const layout: { layoutVariable?: string } | undefined = p.layout;
        return layout?.layoutVariable;
      }),
    );
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
