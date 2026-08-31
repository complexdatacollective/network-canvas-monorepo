import { type ContextType, createContext, useContext } from 'react';

import type { FormStoreContext } from '@codaco/fresco-ui/form/store/formStoreProvider';

import type { StageEditorController } from '../controller.ts';
import type { StageFormDraft, StageIdentity } from '../session.ts';
import type { SectionOutlineStore } from './outlineStore.ts';

/**
 * The zustand store api behind a Fresco form (`subscribe`, `getState`).
 * fresco-ui does not publish the type on its own subpath, so it is recovered
 * from the context that carries it.
 */
export type StageFormStoreApi = NonNullable<
  ContextType<typeof FormStoreContext>
>;

export type StageEditorFormContextValue = Readonly<{
  /** DOM id of the stage `<form>`, for a submit control rendered outside it. */
  formId: string;
  controller: StageEditorController;
  /**
   * The stage form's own store.
   *
   * Deliberately NOT re-provided by the nested `FormStoreProvider`s that item
   * dialogs mount, so a control inside a dialog can still read and write the
   * stage form behind it while `useFormStore` addresses the dialog's form.
   */
  storeApi: StageFormStoreApi;
  /**
   * The draft as the session held it when this form opened. Source of every
   * field's `initialValue`, and the fallback for a section deciding whether
   * it has anything to show before its fields have registered.
   */
  committedFields: StageFormDraft;
  /** Session-owned; never a form field. */
  identity: StageIdentity;
  readOnly: boolean;
  outline: SectionOutlineStore;
  /** True once a submit attempt has failed. */
  submitFailed: boolean;
}>;

export const StageEditorFormContext =
  createContext<StageEditorFormContextValue | null>(null);

export function useStageEditorForm(): StageEditorFormContextValue {
  const context = useContext(StageEditorFormContext);
  if (context === null) {
    throw new Error('useStageEditorForm must be used inside a stage editor');
  }
  return context;
}

/**
 * The section a field is being rendered inside. Sections provide it; the
 * package's field wrapper reads it so the outline can say which section an
 * error or a missing value belongs to.
 */
export const SectionScopeContext = createContext<string | null>(null);

export function useSectionScope(): string | null {
  return useContext(SectionScopeContext);
}
