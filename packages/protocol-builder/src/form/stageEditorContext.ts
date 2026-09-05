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

/**
 * What a structural write did.
 *
 * The draft alone cannot say. A write the session refuses is answered with the
 * draft it already held, which is indistinguishable from a write that changed
 * nothing — and a lease can be taken back between the render a handler was
 * built in and the click that runs it, so a caller's own `readOnly` is not the
 * answer either. A list editor committing from a click handler can live with
 * the refusal being reported in the form's error region; a row dialog cannot,
 * because closing over a draft the session declined discards it.
 */
export type OwnCommandsResult = Readonly<{
  /** The draft the session holds after the batch; unchanged when refused. */
  draft: StageFormDraft;
  /** Whether the session declined the write because it is read-only. */
  refused: boolean;
}>;

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
   * this exists: a draft that arrives from elsewhere is written back over the
   * controls on screen, and a write the form made itself must not be mistaken
   * for one of those — it would undo everything typed since.
   *
   * An empty batch is a READ of the draft the session holds now, and is never
   * refused.
   */
  applyOwnCommands(commands: readonly Command[]): OwnCommandsResult;
  /**
   * Puts a refused structural write in front of the researcher, in the form's
   * own error region.
   *
   * `applyOwnCommands` reports the refusals IT can name — the ones about the
   * lease — because a caller cannot be asked to know which of the two read-only
   * routes it met. The refusals it cannot name are the ones about the array a
   * write was resolved against: a removed row, a row that cannot be told from
   * its neighbours. Those reach the session as a batch that was simply never
   * dispatched, so only the list that built it knows there was anything to say.
   *
   * For the writes that happen in a click handler, which has nowhere to return
   * an answer to. A row dialog reports its own instead, above the draft it is
   * keeping open.
   */
  reportRefusedWrite(message: string): void;
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
