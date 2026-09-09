import { type ContextType, createContext, useContext } from 'react';

import type { FormStoreContext } from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { Command } from '@codaco/studio-sync/apply';

import type {
  StageCreation,
  StageFormDraft,
  StageIdentity,
} from '../stageDocument.ts';
import type { SectionOutlineStore } from './outlineStore.ts';

/**
 * The zustand store api behind a Fresco form (`subscribe`, `getState`).
 * fresco-ui does not publish the type on its own subpath, so it is recovered
 * from the context that carries it.
 */
export type StageFormStoreApi = NonNullable<
  ContextType<typeof FormStoreContext>
>;

/**
 * What a structural write did.
 *
 * The draft alone cannot say: a write that was refused answers with the draft
 * the form already held, which is indistinguishable from one that changed
 * nothing. A list editor committing from a click handler can live with the
 * refusal being reported in the form's error region; a row dialog cannot,
 * because closing over a draft that was declined discards it.
 */
export type OwnCommandsResult = Readonly<{
  /** The draft after the batch; unchanged when refused. */
  draft: StageFormDraft;
  /** Whether the write was declined because the editor is read-only. */
  refused: boolean;
}>;

/**
 * Everything `form/` needs from the edit, and its only route to it.
 *
 * The editor owns its section while it holds the lock, so nothing here reaches
 * a host at write time: the document is the form's, and a submit hands the
 * whole of it back. What another section holds is read by the component that
 * renders it, through the state hooks, and never from here.
 */
export type StageEditorFormContextValue = Readonly<{
  /** DOM id of the stage `<form>`, for a submit control rendered outside it. */
  formId: string;
  /**
   * The stage form's own store.
   *
   * Deliberately NOT re-provided by the nested `FormStoreProvider`s that item
   * dialogs mount, so a control inside a dialog can still read and write the
   * stage form behind it while `useFormStore` addresses the dialog's form.
   */
  storeApi: StageFormStoreApi;
  /**
   * The document the editor opened on. Source of every field's `initialValue`,
   * and the fallback for a section deciding whether it has anything to show
   * before its fields have registered.
   */
  committedFields: StageFormDraft;
  /**
   * Issues commands on the form's own behalf, and answers with the draft they
   * produced.
   *
   * A list editor writes structurally — insert this row, remove that one — and
   * needs the resulting document back, because it also owns a control bound to
   * that list and reading the value out of a render it was memoised on would
   * leave the control a revision behind its own edit.
   *
   * An empty batch is a READ of the document as it stands now, and is never
   * refused.
   */
  applyOwnCommands(commands: readonly Command[]): OwnCommandsResult;
  /**
   * Puts a refused structural write in front of the researcher, in the form's
   * own error region.
   *
   * For writes that happen in a click handler, which has nowhere to return an
   * answer to. `applyOwnCommands` reports the refusal it can see for itself —
   * the editor being read-only — and a list editor reports the ones it cannot:
   * a batch it decided not to issue because the row it named is gone reaches
   * this form as nothing at all, so only the list knows there was anything to
   * say.
   */
  reportRefusedWrite(message: string): void;
  /** Section-owned; never a form field. */
  identity: StageIdentity;
  /**
   * Set while this stage is being CREATED, and `undefined` for one the
   * interview already contains. `StageNameSection` proposes a name only for one
   * of these, and `SkipLogicSection` offers destinations from `position`
   * because a stage the stage order does not list has no place of its own.
   */
  creation: StageCreation | undefined;
  /** Someone else holds this section's lock. */
  readOnly: boolean;
  outline: SectionOutlineStore;
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
