import { act } from '@testing-library/react';

import {
  applyCommands,
  type Command,
  contentHash,
  type SectionDoc,
} from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { FIXTURE_SESSION_OWNER } from './fixtureSession.ts';
import type { StageEditorHarness } from './renderStageEditor.tsx';

let requestsMade = 0;

type CollaboratorEdit = Readonly<{
  description: string;
  commands: readonly Command[];
}>;

/**
 * The collaborator's half: the edit reaches the HOST, which issues the
 * revision for it.
 *
 * Throws rather than returning a status: an arrival the host refused is a test
 * asserting against a change that never happened. The commands are the
 * collaborator's own, so they have to leave a protocol the host will accept —
 * it validates the whole protocol as it applies the submission.
 */
function submitCollaboratorStageEdit(
  harness: StageEditorHarness,
  stageId: string,
  edit: CollaboratorEdit,
): void {
  const stageSection = sectionId({ kind: 'stage', stageId });
  const sections = harness.host.getSnapshot().protocolSections;
  const result = harness.host.submit({
    // A fresh request id per call: the host refuses a reused id that carries
    // different edits, so a test making two collaborator edits in a row would
    // otherwise be answered `requestIdReused` instead of the second edit.
    id: `collaborator-${(requestsMade += 1)}`,
    description: edit.description,
    edits: [
      {
        kind: 'update',
        sectionId: stageSection,
        expectedContentHash: contentHash(sections[stageSection] ?? {}),
        commands: [...edit.commands],
      },
    ],
    authority: {
      sectionId: stageSection,
      leaseOwner: FIXTURE_SESSION_OWNER,
      leaseEpoch: 1n,
    },
  });
  if (result.status !== 'applied') {
    throw new Error(
      `the collaborator’s stage edit did not apply: ${JSON.stringify(result)}`,
    );
  }
}

/**
 * Another session's edit to THE STAGE this harness is editing.
 *
 * The harness's own arrival helper is for codebook changes and deliberately
 * keeps this session's copy of the edited stage — so nothing it offers can say
 * that a collaborator repointed the stage at another type, renamed it, or
 * rewrote what it collects. This is that arrival, and it is one edit seen from
 * both ends: the HOST issues the revision for it, and the session is then told
 * about it under that same revision and acknowledges the new document, which
 * is what `reseedStageForm` writes into the controls on screen.
 *
 * Commands are the collaborator's, so a caller sends whatever their edit
 * actually did — and it has to leave a protocol the host will accept: a stage
 * repointed at another type must carry fields that type can answer, because
 * the host validates the whole protocol as it applies the submission.
 *
 * Throws rather than returning a status: an arrival the host refused is a test
 * asserting against a change that never happened.
 */
export function receiveCollaboratorStageEdit(
  harness: StageEditorHarness,
  edit: CollaboratorEdit,
): void {
  const stageSection = sectionId({ kind: 'stage', stageId: harness.seeded.id });
  submitCollaboratorStageEdit(harness, harness.seeded.id, edit);

  const { protocolSections, manifestRevision } = harness.host.getSnapshot();
  const document: unknown = protocolSections[stageSection];
  const stageDocument: SectionDoc =
    typeof document === 'object' &&
    document !== null &&
    !Array.isArray(document)
      ? (document as SectionDoc)
      : {};
  act(() => {
    harness.session.receiveAuthoritativeUpdate({
      protocolSections,
      manifestRevision,
    });
    harness.session.acknowledge({
      // Which stage this is belongs to the session, not to a draft.
      fields: Object.fromEntries(
        Object.entries(stageDocument).filter(
          ([key]) => key !== 'id' && key !== 'type',
        ),
      ),
      // Nothing of this session's is in it: what the researcher is writing is
      // a dialog's own draft, and nothing has been staged against the stage.
      throughBatchId: 0,
      manifestRevision,
    });
  });
}

/**
 * Another session's edit to a DIFFERENT stage of the same protocol.
 *
 * The arrival a rule that reaches across stages needs: which attributes an
 * interface owns the values of, and which structural slots are already
 * claimed, are facts about the WHOLE protocol, so the edit that changes them
 * for the stage on screen is an edit to a stage that is not on screen.
 *
 * It arrives the way the harness's codebook change does — through
 * `receiveAuthoritativeSections`, which is how a change made outside every
 * session on this host reaches it — rather than as a submission: this host
 * holds a lease for the edited stage alone, so a submission naming another
 * stage is answered `lease-lost` however well formed it is. The commands are
 * still the collaborator's own and are applied by the same
 * `applyCommands` a host would run, so a caller writes what their edit did
 * rather than a whole replacement document that could silently drop a key the
 * protocol fixture has grown.
 *
 * No `acknowledge`, and this session's own copy of the edited stage is kept:
 * the collaborator did not touch it, and handing the session the host's copy
 * would quietly replace the document the researcher is working on with the one
 * the host last accepted. The same rule the harness's codebook arrival follows
 * (`sectionsKeepingSavedStage`).
 */
export function receiveCollaboratorEditToOtherStage(
  harness: StageEditorHarness,
  stageId: string,
  commands: readonly Command[],
): void {
  if (stageId === harness.seeded.id) {
    throw new Error(
      `receiveCollaboratorEditToOtherStage was given "${stageId}", which is the stage this harness is editing. Use receiveCollaboratorStageEdit, which submits the edit under this session's lease and acknowledges the new document into the controls on screen.`,
    );
  }
  const stageSection = sectionId({ kind: 'stage', stageId });
  const current = harness.host.getSnapshot().protocolSections[stageSection];
  if (current === undefined) {
    throw new Error(
      `the protocol has no stage "${stageId}" for a collaborator to edit`,
    );
  }
  const edited = applyCommands(current, [...commands]);
  const editedStageSection = sectionId({
    kind: 'stage',
    stageId: harness.seeded.id,
  });
  const ownStage =
    harness.session.getSnapshot().protocolSections[editedStageSection];
  act(() => {
    // Inside the act with the arrival it causes: the host notifies its own
    // subscribers as it takes the change, and a render provoked from outside
    // one is a render the assertions below race.
    const applied = harness.host.receiveAuthoritativeSections({
      [stageSection]: edited,
    });
    harness.session.receiveAuthoritativeUpdate({
      protocolSections:
        ownStage === undefined
          ? applied.protocolSections
          : { ...applied.protocolSections, [editedStageSection]: ownStage },
      manifestRevision: applied.manifestRevision,
    });
  });
}
