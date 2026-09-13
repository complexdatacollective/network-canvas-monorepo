import { createAction } from '@reduxjs/toolkit';

import type { Stage } from '@codaco/protocol-validation';

export type CommitStagePayload = {
  /** The stage being edited, or `null` when the editor is creating one. */
  stageId: string | null;
  /** The finished stage, already carrying its id. */
  stage: Stage;
  /** Insert position, honoured only when `stageId` is `null`. */
  index?: number;
};

/**
 * Saving a stage editor's document.
 *
 * Named under `stages/` so it matches the protocol timeline's action pattern
 * in `ducks/modules/root.ts` and remains a single undo step. Mirrors the
 * `deleteStage` idiom: a standalone action module, so a reducer that handles
 * it never has to import the slice that dispatches it.
 */
export const commitStage =
  createAction<CommitStagePayload>('stages/commitStage');
