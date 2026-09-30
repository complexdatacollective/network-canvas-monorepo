import type { ReactNode } from 'react';

import type { StageFormDraft } from '../../stageDocument.ts';
import {
  documentFromSubmission,
  dormantFieldsOf,
  mountedPathsOf,
} from '../documentFromSubmission.ts';
import { useStageEditorForm } from '../stageEditorContext.ts';

export type StageDraftProbe = Readonly<{
  /** Mount this among the sections under test. */
  probe: ReactNode;
  /** The stage document a save would write right now. */
  draft(): StageFormDraft;
}>;

/**
 * Reads the stage document an open editor would save, before any save.
 *
 * Asked through {@link documentFromSubmission} — the one function the stage
 * form's own submit asks — so a test sees exactly what the researcher's next
 * save would write. That matters because the form primitives are exercised
 * over stage keys no interface's schema declares (`prompts` on an Information
 * page), and a save of one of those is refused for its shape long before it
 * reaches the protocol, so there is nothing for a test to read out of the host.
 *
 * `draft()` throws when nothing has mounted the probe, so a test that puts it
 * somewhere the editor never renders fails rather than comparing two empty
 * documents.
 */
export function createStageDraftProbe(): StageDraftProbe {
  let read: (() => StageFormDraft) | undefined;

  function Probe() {
    const { committedFields, storeApi } = useStageEditorForm();
    read = () =>
      documentFromSubmission({
        currentFields: committedFields,
        submittedValues: storeApi.getState().getFormValues(),
        mountedPaths: mountedPathsOf(storeApi),
        dormantFields: dormantFieldsOf(storeApi),
      });
    return null;
  }

  return {
    probe: <Probe />,
    draft: () => {
      if (read === undefined) {
        throw new Error(
          'the stage draft probe was never mounted, so there is no editor to read a document from',
        );
      }
      return read();
    },
  };
}
