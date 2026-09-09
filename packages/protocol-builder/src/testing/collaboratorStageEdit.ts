import { act } from '@testing-library/react';

import {
  type Command,
  contentHash,
  type SectionDoc,
} from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { FIXTURE_SESSION_OWNER } from './fixtureSession.ts';
import type { StageEditorHarness } from './renderStageEditor.tsx';

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
  edit: Readonly<{ description: string; commands: readonly Command[] }>,
): void {
  const stageSection = sectionId({ kind: 'stage', stageId: harness.seeded.id });
  const sections = harness.host.getSnapshot().protocolSections;
  const result = harness.host.submit({
    id: `collaborator-${harness.seeded.id}`,
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
