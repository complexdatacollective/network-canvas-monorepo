import type { ReactNode } from 'react';

import type { StageFormDraft } from '../../stageDocument.ts';
import { useStageEditorForm } from '../stageEditorContext.ts';

export type StageDraftProbe = Readonly<{
  /** Mount this among the sections under test. */
  probe: ReactNode;
  /** The stage document the editor is holding right now. */
  draft(): StageFormDraft;
}>;

/**
 * Reads the document an open editor is holding, before any save.
 *
 * An empty batch through `applyOwnCommands` is the package's own read of the
 * live document — the very value a submit assembles from the form's fields
 * over the writes a list has made — so a test can see what a list editor wrote
 * without saving. That matters because the form primitives are edited over
 * stage keys no interface's schema declares (`prompts` on an Information
 * page), and a save of one of those is refused for its shape long before it
 * reaches the protocol.
 *
 * `draft()` throws when nothing has mounted the probe, so a test that puts it
 * somewhere the editor never renders fails rather than comparing two empty
 * documents.
 */
export function createStageDraftProbe(): StageDraftProbe {
  let read: (() => StageFormDraft) | undefined;

  function Probe() {
    const { applyOwnCommands } = useStageEditorForm();
    read = () => applyOwnCommands([]).draft;
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
