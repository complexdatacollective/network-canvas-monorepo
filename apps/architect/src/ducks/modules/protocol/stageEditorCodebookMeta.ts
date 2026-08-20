import type { UnknownAction } from '@reduxjs/toolkit';

/**
 * Marks a `codebook/*` slice action as belonging to an open stage-editor
 * codebook transaction.
 *
 * A stage editor's nested field and variable editors write the codebook, but
 * nothing they write may reach the canonical protocol until the stage itself
 * is committed — otherwise cancelling a field, or discarding the stage, leaves
 * the shared codebook mutated for every other consumer (see #1382). Stamping
 * the action instead of introducing a parallel set of action types keeps one
 * reducer implementation for both stores: `stageEditorDraft` runs the very
 * same `codebook` reducer over its draft copy.
 *
 * `skipTimeline` keeps the stamped action off the *protocol* timeline;
 * `stageEditorDraft` records it on its own draft timeline instead, so one
 * field-editor save is one in-editor undo step.
 *
 * This module deliberately imports nothing from the ducks: both
 * `stageEditorDraft` and `activeProtocol` route on it, and either import
 * direction would close a cycle.
 */
export const stageEditorCodebookMeta = {
  stageEditorDraft: true,
  skipTimeline: true,
} as const;

type StampedAction = UnknownAction & {
  meta?: { stageEditorDraft?: boolean };
};

export const isStageEditorCodebookAction = (action: UnknownAction): boolean =>
  typeof action.type === 'string' &&
  action.type.startsWith('codebook/') &&
  (action as StampedAction).meta?.stageEditorDraft === true;
