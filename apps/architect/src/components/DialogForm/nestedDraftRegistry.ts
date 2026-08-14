import { useEffect, useRef, useSyncExternalStore } from 'react';

/**
 * The seam every guard that could destroy unsaved work consults for editors
 * that are NOT the stage form: the "are you sure you want to leave?"
 * confirmations, and — since a nested draft can also be torn away by the
 * cross-tab lock rather than by navigation — the read-only swap and the
 * protocol reclaim (`useProtocolAccessMode`, `useProtocolTabLock`).
 *
 * A nested editor — a form field, a nomination prompt, an ordinal option, a
 * skip-logic rule — keeps its draft in its own store or in component state and
 * only reports it through `onSubmit`. None of it reaches
 * `getLiveStageDraftDirty`, which reads the stage form's Redux mirror and was
 * the single predicate every one of those guards consulted. So an open,
 * half-typed nested editor left them all reading "pristine", and Back, a
 * refresh, a demotion or a reclaim discarded it with no warning at all.
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

/**
 * Whether ANY nested editor is open, dirty or not.
 *
 * The question the cross-tab lock's read-only swap asks. Deliberately not the
 * dirty one: dirtiness flips back to clean the moment the researcher undoes
 * their typing, and a guard keyed on it would tear the editor away mid-edit —
 * the same reasoning that keys `held-stage-editor` on the route rather than on
 * `getLiveStageDraftDirty`. An editor being open, by contrast, only changes
 * when the researcher opens or closes one.
 */
const hasOpenNestedEditor = (): boolean => draftPredicates.size > 0;

// Notified whenever an editor registers or unregisters — i.e. whenever one
// opens or closes. Dirtiness itself is deliberately NOT observable: the
// predicates are evaluated at ask time so they always reflect the live editor,
// which means there is nothing to fire on when a keystroke changes the answer.
// Opening and closing are the only transitions that can resolve a question
// already on screen ("finish or cancel that editor"), and both pass through
// here.
const registrationListeners = new Set<() => void>();

const subscribeNestedDrafts = (listener: () => void) => {
  registrationListeners.add(listener);
  return () => {
    registrationListeners.delete(listener);
  };
};

const notifyRegistrationChange = () => {
  for (const listener of registrationListeners) listener();
};

/**
 * Re-renders the caller whenever a nested editor opens or closes, reporting
 * whether one is open now.
 */
export const useNestedEditorOpen = (): boolean =>
  useSyncExternalStore(subscribeNestedDrafts, hasOpenNestedEditor);

/**
 * Re-renders the caller whenever a nested editor opens or closes, reporting
 * whether any of them holds unsaved work now.
 *
 * The answer can change between notifications (a keystroke), so this is not a
 * complete subscription and is not treated as one: every consumer uses it to
 * decide whether to KEEP blocking, where a stale `true` costs nothing and is
 * cleared by the close that follows.
 */
export const useNestedDraftDirty = (): boolean =>
  useSyncExternalStore(subscribeNestedDrafts, hasDirtyNestedDraft);

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
  notifyRegistrationChange();

  return () => {
    draftPredicates.delete(key);
    syncBeforeUnloadListener();
    notifyRegistrationChange();
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
