import { v1 as uuid } from 'uuid';

import type { CurrentProtocol, Stage } from '@codaco/protocol-validation';
import prune from '~/utils/prune';

/**
 * Builds a protocol with the current wip stage inserted or updated.
 * Allows for validating and previewing the protocol with the current stage changes.
 * If inserting a new stage (i.e., stageId is null), generates a temporary ID for the stage for validation/preview purposes.
 *
 * The stage is pruned (null/empty values stripped) so that preview validates the
 * exact shape a save would commit. The form contract excludes null, but this
 * function can also receive drafts assembled outside the form; pruning here
 * matches the `commitStageEditorDraft` commit boundary and avoids previewing
 * a shape that would never be saved. It also means a panel with no title resolves
 * to a genuinely-invalid protocol (missing required `title`) rather than a
 * transient empty value, which keeps preview correctly disabled until a title
 * is entered.
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
