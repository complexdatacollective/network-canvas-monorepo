import { omit } from 'es-toolkit/compat';
import { v1 as uuid } from 'uuid';

import type { CurrentProtocol, Stage } from '@codaco/protocol-validation';
import prune from '~/utils/prune';

/**
 * Normalises the live form values into the stage that preview will actually
 * build, validate, and launch.
 *
 * `_modified` is editor-only bookkeeping and is always dropped. The preview
 * override is determined after this stage is inserted into the work-in-progress
 * protocol, so the real skip logic remains in place.
 */
export function normalizePreviewStage(formValues: Stage): Stage {
  return omit(formValues, ['_modified']) as Stage;
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
