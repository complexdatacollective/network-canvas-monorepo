import { type ContextType, createContext, useContext } from 'react';

import type { FormStoreContext } from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { Stage } from '@codaco/protocol-validation';

/**
 * The vanilla zustand store api backing a fresco-ui form (`subscribe`,
 * `getState`). fresco-ui does not publish the `FormStoreApi` type on its own
 * subpath, so it is recovered from the context it is carried in.
 */
export type StageFormStoreApi = NonNullable<
  ContextType<typeof FormStoreContext>
>;

/**
 * Imperative handle onto the draft-history bridge. Owned by `StageFormBridge`,
 * consumed by `useStageDraftHistory`.
 */
export type StageDraftController = {
  /**
   * Cancel an armed debounce so a stale timer cannot land a snapshot after an
   * undo/redo has already moved the timeline.
   */
  cancelPendingSnapshot: () => void;
  /**
   * Run `apply` with snapshotting suppressed, then refresh the Redux mirror.
   * Every write an undo/redo makes to the form store goes through here.
   */
  runRestore: (apply: () => void) => void;
  /** Write the form's current values into `stageEditorDraft.ui.liveValues` now. */
  refreshLiveValues: () => void;
};

export type StageFormContextValue = {
  /** DOM id of the stage `<form>` element (`SubmitButton form={…}`). */
  formId: string;
  /**
   * The stage form's store api. This context is deliberately *not* re-provided
   * by the nested `FormStoreProvider`s that dialog editors mount, so a
   * component rendered inside an item-edit dialog can still read and write the
   * stage form behind it while `useFormStore` addresses the dialog's own form.
   */
  storeApi: StageFormStoreApi;
  /**
   * The last committed values for this stage — the persisted stage, or the
   * interface template for a stage being created. Source of per-field
   * `initialValue`s and of the draft baseline.
   */
  committedStage: Stage | null;
  /** Id of the stage being edited; null while creating a new stage. */
  stageId: string | null;
  /** True once a submit attempt has failed validation. */
  submitFailed: boolean;
  markSubmitFailed: () => void;
  clearSubmitFailed: () => void;
  draft: StageDraftController;
};

export const StageFormContext = createContext<StageFormContextValue | null>(
  null,
);

export const useStageFormContext = (): StageFormContextValue => {
  const context = useContext(StageFormContext);

  if (!context) {
    throw new Error('useStageFormContext must be used within a StageForm');
  }

  return context;
};
