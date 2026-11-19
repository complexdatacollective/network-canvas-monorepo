import { v1 as uuid } from 'uuid';

import {
  interfaceTextWithUpdates,
  withInterfaceText,
} from '@codaco/interview/supplied-wording';
import { protocolSections } from '@codaco/protocol-builder/host/protocolSections';
import {
  NOTHING_STAGED,
  overlaySections,
  type StagedCodebook,
} from '@codaco/protocol-builder/state/stagedCodebook';
import {
  type CurrentProtocol,
  type InterfaceTextUpdate,
  type Stage,
} from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import {
  isCodebookSectionId,
  parseSectionId,
} from '@codaco/studio-sync/taxonomy';
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
  const stageWithId = stageId ? prunedStage : { ...prunedStage, id: uuid() };
  // Where a save would put it: a new stage never lands after the finish stage.
  const insertAt = creationIndex(protocol.stages, prunedStage, insertAtIndex);

  return withInterfaceText({
    ...protocol,
    codebook: codebookWithChanges(protocol, codebook),
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

/**
 * The protocol's codebook with the stage editor's codebook changes laid over
 * it, section by section, as a save would leave it.
 */
function codebookWithChanges(
  protocol: CurrentProtocol,
  changes: StagedCodebook,
): CurrentProtocol['codebook'] {
  if (Object.keys(changes).length === 0) return protocol.codebook;
  const sections = overlaySections(
    changes,
    Object.fromEntries(
      [...protocolSections(protocol)].filter(([id]) => isCodebookSectionId(id)),
    ),
  );
  const node: Record<string, SectionDoc> = {};
  const edge: Record<string, SectionDoc> = {};
  let ego: SectionDoc | undefined;
  for (const [id, document] of Object.entries(sections)) {
    const ref = parseSectionId(id);
    if (ref.kind === 'codebookNode') node[ref.typeId] = document;
    else if (ref.kind === 'codebookEdge') edge[ref.typeId] = document;
    else if (ref.kind === 'codebookEgo') ego = document;
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the protocol's codebook with sections replaced by documents the editor built; every reader validates the protocol built from it (validateProtocol) before relying on it
  return {
    ...protocol.codebook,
    node,
    edge,
    ego,
  } as CurrentProtocol['codebook'];
}
