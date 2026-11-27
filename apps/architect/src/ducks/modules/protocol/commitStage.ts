import { createAction } from '@reduxjs/toolkit';

import type {
  CurrentProtocol,
  EdgeDefinition,
  EgoDefinition,
  LayoutDefinition,
  NodeDefinition,
  Stage,
} from '@codaco/protocol-validation';

/** One codebook section a stage's save leaves, whole. */
export type CommittedCodebookSection =
  | Readonly<{ entity: 'node'; type: string; definition: NodeDefinition }>
  | Readonly<{ entity: 'edge'; type: string; definition: EdgeDefinition }>
  | Readonly<{ entity: 'ego'; definition: EgoDefinition }>
  | Readonly<{
      entity: 'layout';
      layoutId: string;
      definition: LayoutDefinition;
    }>;

export type CommitStagePayload = {
  /** The stage being edited, or `null` when the editor is creating one. */
  stageId: string | null;
  /** The finished stage, already carrying its id. */
  stage: Stage;
  /** Insert position, honoured only when `stageId` is `null`. */
  index?: number;
  /**
   * The protocol's shared words as they read with the stage saved, when the
   * stage brings in words the protocol did not hold (see the contract's
   * `interfaceText` on a submit): written by the same action, so the stage and
   * its words are one undo step.
   */
  interfaceText?: CurrentProtocol['interfaceText'];
  /**
   * The codebook sections the stage's editor changed, each written whole (a
   * type or the ego section the codebook lacks is created), in the same
   * action so the stage and the codebook it relies on are one undo step.
   */
  codebook?: readonly CommittedCodebookSection[];
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
