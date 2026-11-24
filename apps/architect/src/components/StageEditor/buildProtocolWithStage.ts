import {
  interfaceTextWithUpdates,
  withInterfaceText,
} from '@codaco/interview/supplied-wording';
import {
  codebookWithStaged,
  NOTHING_STAGED,
  type StagedCodebook,
} from '@codaco/protocol-builder/state/stagedCodebook';
import {
  createProtocolObjectId,
  type CurrentProtocol,
  type InterfaceTextUpdate,
  type Stage,
} from '@codaco/protocol-validation';
import { creationIndex } from '~/ducks/modules/protocol/stages';
import prune from '~/utils/prune';

/**
 * Builds a protocol with the current wip stage inserted or updated.
 * Allows for validating and previewing the protocol with the current stage changes.
 * If inserting a new stage (i.e., stageId is null), generates a temporary ID for the stage for validation/preview purposes.
 *
 * The stage is pruned (null/empty values stripped) so that preview validates the
 * exact shape a save would commit. The form contract excludes null, but this
 * function can also receive drafts assembled outside the form; pruning here
 * matches the `commitStage` commit boundary and avoids previewing
 * a shape that would never be saved. It also means a panel with no title resolves
 * to a genuinely-invalid protocol (missing required `title`) rather than a
 * transient empty value, which keeps preview correctly disabled until a title
 * is entered.
 *
 * The result holds the interface text the saved protocol will
 * (`withInterfaceText`): the researcher's own wording for the entries it
 * shows. `interfaceText` is the shared wording the stage editor holds with the
 * stage (`pendingSharedWording`), which a save writes with the stage, so the
 * preview shows the wording the researcher has changed or brought into use
 * rather than what the protocol held before. `codebook` is the codebook
 * changes the editor holds with the stage (see `StagedCodebookStore`), laid
 * over the protocol's codebook for the same reason.
 */
export function buildProtocolWithStage(
  protocol: CurrentProtocol,
  stage: Stage,
  stageId: string | null,
  insertAtIndex?: number,
  interfaceText: readonly InterfaceTextUpdate[] = [],
  codebook: StagedCodebook = NOTHING_STAGED,
): CurrentProtocol {
  const prunedStage = prune(stage);

  // For new stages, generate a temp ID for validation/preview
  const stageWithId = stageId
    ? prunedStage
    : { ...prunedStage, id: createProtocolObjectId() };
  // Where a save would put it: a new stage never lands after the finish stage.
  const insertAt = creationIndex(protocol.stages, prunedStage, insertAtIndex);

  return withInterfaceText({
    ...protocol,
    codebook: codebookWithStaged(protocol.codebook, codebook),
    ...(interfaceText.length === 0
      ? {}
      : {
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the protocol's own shared words with entries written over them; the preview validates the protocol before it is used, which refuses words the schema does not accept
          interfaceText: interfaceTextWithUpdates(
            protocol.interfaceText,
            interfaceText,
          ) as CurrentProtocol['interfaceText'],
        }),
    stages: stageId
      ? protocol.stages.map((s) => (s.id === stageId ? stageWithId : s))
      : [
          ...protocol.stages.slice(0, insertAt),
          stageWithId,
          ...protocol.stages.slice(insertAt),
        ],
  });
}
