import { type ContextType, createContext, useContext } from 'react';

import type { FormStoreContext } from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { Command } from '@codaco/studio-sync/apply';

import type { StageEditorController } from '../controller.ts';
import type { ProtocolBuilderProtocolContext } from '../protocol-context.ts';
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
  /**
   * Issues commands on the FORM's own behalf, and answers with the draft they
   * produced.
   *
   * A list editor writes structurally — insert this row, move that one — so
   * that the edit survives being replayed onto a list something else has
   * changed. Those writes reach the session immediately rather than waiting
   * for the submit that flushes ordinary fields, which is the whole reason
   * this exists: the form is keyed on the committed draft, so a write the form
   * made itself must not be mistaken for one that arrived from elsewhere and
   * tear down every control on screen (an open row dialog included) to
   * re-seed them.
   */
  applyOwnCommands(commands: readonly Command[]): StageFormDraft;
  /** Session-owned; never a form field. */
  identity: StageIdentity;
  /** Tolerant, typed metadata derived from authoritative protocol sections. */
  protocolContext: ProtocolBuilderProtocolContext;
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
