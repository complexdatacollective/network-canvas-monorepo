import { useEffect, useRef } from 'react';

/**
 * The seam every "are you sure you want to leave?" guard consults for editors
 * that are NOT the stage form.
 *
 * A nested editor — a form field, a nomination prompt, an ordinal option, a
 * skip-logic rule — keeps its draft in its own store or in component state and
 * only reports it through `onSubmit`. None of it reaches
 * `getLiveStageDraftDirty`, which reads the stage form's Redux mirror and is
 * the single predicate all three navigation guards used. So an open, half-typed
 * nested editor left every guard reading "pristine", and Back or a refresh
 * discarded it with no warning at all.
 *
 * Module state rather than Redux, deliberately: this is per-mount UI state that
 * must never be persisted, undone or redone — the same reasoning as
 * `guardState` in `useProtocolNavGuard`.
 */
type DirtyPredicate = () => boolean;

const draftPredicates = new Map<symbol, DirtyPredicate>();

export const hasDirtyNestedDraft = (): boolean => {
  for (const isDirty of draftPredicates.values()) {
    if (isDirty()) return true;
  }
  return false;
};

const handleBeforeUnload = (event: BeforeUnloadEvent) => {
  if (!hasDirtyNestedDraft()) return;
  // Setting returnValue triggers the browser's native "leave site?" prompt;
  // the string is legacy and ignored by modern browsers.
  event.preventDefault();
  event.returnValue = '';
};

let listenerAttached = false;

/**
 * The registry owns its own `beforeunload` rather than leaning on the stage
 * editor's, which is scoped to that component's mount. A dirty nested editor in
 * the Codebook or Resources is just as lost on refresh, and would otherwise
 * never be guarded. Two handlers both calling `preventDefault` still produce one
 * browser prompt.
 *
 * The listener is attached only while some editor is registered, so the rest of
 * the app stays eligible for the back/forward cache.
 */
const syncBeforeUnloadListener = () => {
  const wanted = draftPredicates.size > 0;
  if (wanted === listenerAttached) return;

  if (wanted) {
    window.addEventListener('beforeunload', handleBeforeUnload);
  } else {
    window.removeEventListener('beforeunload', handleBeforeUnload);
  }
  listenerAttached = wanted;
};

const registerNestedDraft = (isDirty: DirtyPredicate): (() => void) => {
  const key = Symbol('nested-draft');
  draftPredicates.set(key, isDirty);
  syncBeforeUnloadListener();

  return () => {
    draftPredicates.delete(key);
    syncBeforeUnloadListener();
  };
};

/**
 * Registers `isDirty` for as long as `active` is true.
 *
 * `isDirty` is read through a ref, so a caller may pass a fresh closure every
 * render without churning the registration — and the predicate is always
 * evaluated at ASK time, never sampled, so it reflects the editor's live state
 * when a guard runs.
 */
export const useNestedDraft = (active: boolean, isDirty: DirtyPredicate) => {
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  useEffect(() => {
    if (!active) return undefined;
    return registerNestedDraft(() => isDirtyRef.current());
  }, [active]);
};
