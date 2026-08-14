import { createAction } from '@reduxjs/toolkit';

import type { Codebook, Stage } from '@codaco/protocol-validation';

export type CommitStageEditorDraftPayload = {
  /** The stage being edited, or `null` when the editor is creating one. */
  stageId: string | null;
  /** The finished stage, already carrying its id. */
  stage: Stage;
  /** Insert position, honoured only when `stageId` is `null`. */
  index?: number;
  /**
   * The stage editor's draft codebook, promoted to the canonical protocol by
   * this same action.
   */
  codebook: Codebook | null;
};

/**
 * Promoting a stage editor's draft — its stage AND every codebook edit its
 * nested field/variable editors made — is one user operation. Both the stages
 * and codebook reducers handle this action so the timeline, validation, and
 * persistence observe exactly one completed protocol snapshot, and so a
 * half-applied commit (stage saved, codebook not) cannot exist.
 *
 * Named under `stages/` so it matches the protocol timeline's action pattern
 * in `ducks/modules/root.ts` and remains a single undo step. Mirrors the
 * `deleteStage` idiom: a standalone action module, imported by both reducers,
 * so neither has to import the other.
 */
export const commitStageEditorDraft =
  createAction<CommitStageEditorDraftPayload>('stages/commitStageEditorDraft');
