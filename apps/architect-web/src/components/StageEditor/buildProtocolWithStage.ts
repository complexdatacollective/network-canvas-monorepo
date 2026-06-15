import { omit } from 'es-toolkit/compat';
import { v1 as uuid } from 'uuid';

import type { CurrentProtocol, Stage } from '@codaco/protocol-validation';
import prune from '~/utils/prune';

/**
 * Normalises the live form values into the stage that preview will actually
 * build, validate, and launch.
 *
 * `_modified` is editor-only bookkeeping and is always dropped. With "Always
 * show this stage in preview" enabled (the default), skip logic is stripped
 * from the previewed stage so the interview doesn't bounce off the stage the
 * user launched into — but only when the stage actually has skip logic to
 * strip. Both the preview-disabled check and the preview launch must use this
 * same shape, otherwise the button could disable for a problem (e.g. invalid
 * skip-logic rules) that the launched, skip-logic-stripped protocol wouldn't
 * actually have.
 */
export function normalizePreviewStage(
  formValues: Stage,
  ignoreSkipLogic: boolean,
): { stage: Stage; skipLogicBypassed: boolean } {
  const skipLogicBypassed = ignoreSkipLogic && Boolean(formValues.skipLogic);
  const omitKeys = skipLogicBypassed
    ? ['_modified', 'skipLogic']
    : ['_modified'];

  return { stage: omit(formValues, omitKeys) as Stage, skipLogicBypassed };
}

/**
 * Builds a protocol with the current wip stage inserted or updated.
 * Allows for validating and previewing the protocol with the current stage changes.
 * If inserting a new stage (i.e., stageId is null), generates a temporary ID for the stage for validation/preview purposes.
 *
 * The stage is pruned (null/empty values stripped) so that preview validates the
 * exact shape a save would commit. Without this, in-progress drafts can carry
 * placeholder nulls that the strict protocol schema rejects — e.g. a freshly
 * created side panel seeds `filter: null`, which fails `FilterSchema.optional()`
 * (optional accepts `undefined`, not `null`). `updateStage`/`createStage` prune on
 * commit, so previewing the unpruned draft would otherwise report "invalid" for a
 * stage that saves and reopens perfectly fine. Pruning here also means a panel
 * with no title resolves to a genuinely-invalid protocol (missing required
 * `title`) rather than a `null` the user could mistake for a transient state —
 * which is what keeps preview correctly disabled while a title is empty.
 */
export function buildProtocolWithStage(
  protocol: CurrentProtocol,
  stage: Stage,
  stageId: string | null,
  insertAtIndex?: number,
): CurrentProtocol {
  const prunedStage = prune(stage as Record<string, unknown>) as Stage;

  // For new stages, generate a temp ID for validation/preview
  const stageWithId = stageId ? prunedStage : { ...prunedStage, id: uuid() };

  return {
    ...protocol,
    stages: stageId
      ? protocol.stages.map((s) => (s.id === stageId ? stageWithId : s))
      : [
          ...protocol.stages.slice(0, insertAtIndex ?? protocol.stages.length),
          stageWithId,
          ...protocol.stages.slice(insertAtIndex ?? protocol.stages.length),
        ],
  };
}
