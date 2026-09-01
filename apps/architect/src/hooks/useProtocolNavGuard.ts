import { useEffect } from 'react';
import { useLocation } from 'wouter';

import type { DialogContextType } from '@codaco/fresco-ui/dialogs/DialogProvider';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import { hasDirtyNestedDraft } from '~/components/DialogForm/nestedDraftRegistry';
import { flushStageLiveValues } from '~/components/StageEditor/StageFormBridge';
import { useAppDispatch } from '~/ducks/hooks';
import { clearActiveProtocol } from '~/ducks/modules/activeProtocol';
import {
  getProtocolLockState,
  getStorageUnavailable,
} from '~/ducks/modules/app';
import type { RootState } from '~/ducks/modules/root';
import { resetDraft } from '~/ducks/modules/stageEditorDraft';
import type { AppDispatch } from '~/ducks/store';
import { store } from '~/ducks/store';
import { getProtocol } from '~/selectors/protocol';
import { getLiveStageDraftDirty } from '~/selectors/stageEditorDraft';
import { downloadActiveProtocol } from '~/utils/downloadActiveProtocol';

// Shared mutable state read by this hook and the Router's aroundNav.
// - bypass: flipped on while we're performing the confirmed navigation so the
//   guard doesn't re-prompt itself.
// - prompting: true while the leave-editor dialog is open, used to prevent
//   stacking duplicate dialogs (e.g. when the user spam-clicks back).
// - prevPath: the URL the user was at before the most recent navigation.
//   Tracked at the window event level (not via React state) because React 19's
//   useSyncExternalStore re-renders synchronously inside popstate, so a
//   useEffect-based tracker would have already updated to the new URL by the
//   time our popstate handler runs. Stored as the full path (pathname + search
//   + hash) so restoring it preserves query params that pages depend on (e.g.
//   StageEditorPage reads insertAtIndex/type from the search string).
const getFullPath = () =>
  window.location.pathname + window.location.search + window.location.hash;

// path may include a search/hash suffix; pathname always comes first, so a
// prefix check still correctly identifies protocol routes.
export const isProtocolPath = (path: string) => path.startsWith('/protocol');

const PROTOCOL_HISTORY_KEY = '__architectProtocolHistory';

type ProtocolHistoryMarker = {
  depth: number;
  hasAppEntryBeforeProtocol: boolean;
};

const readProtocolHistoryMarker = (): ProtocolHistoryMarker | null => {
  const state: unknown = history.state;
  if (typeof state !== 'object' || state === null || Array.isArray(state)) {
    return null;
  }

  const marker = (state as Record<string, unknown>)[PROTOCOL_HISTORY_KEY];
  if (typeof marker !== 'object' || marker === null) return null;

  const depth = (marker as Record<string, unknown>).depth;
  const hasAppEntryBeforeProtocol = (marker as Record<string, unknown>)
    .hasAppEntryBeforeProtocol;
  if (
    typeof depth !== 'number' ||
    !Number.isInteger(depth) ||
    depth < 1 ||
    typeof hasAppEntryBeforeProtocol !== 'boolean'
  ) {
    return null;
  }

  return { depth, hasAppEntryBeforeProtocol };
};

const initialPath = getFullPath();
const initialHistoryMarker = isProtocolPath(initialPath)
  ? readProtocolHistoryMarker()
  : null;

export const guardState = {
  bypass: false,
  prompting: false,
  prevPath: initialPath,
  protocolHistoryDepth: isProtocolPath(initialPath)
    ? (initialHistoryMarker?.depth ?? 1)
    : 0,
  hasAppEntryBeforeProtocol:
    initialHistoryMarker?.hasAppEntryBeforeProtocol ?? false,
  taggingHistory: false,
  restoringProtocolHistory: null as ProtocolHistoryMarker | null,
};

const tagCurrentProtocolHistoryEntry = (marker: ProtocolHistoryMarker) => {
  const state: unknown = history.state;
  const stateRecord =
    typeof state === 'object' && state !== null && !Array.isArray(state)
      ? (state as Record<string, unknown>)
      : {};

  guardState.taggingHistory = true;
  try {
    history.replaceState(
      { ...stateRecord, [PROTOCOL_HISTORY_KEY]: marker },
      '',
      getFullPath(),
    );
  } finally {
    guardState.taggingHistory = false;
  }
};

const syncProtocolHistoryMarker = (
  path: string,
  marker: ProtocolHistoryMarker | null,
) => {
  guardState.prevPath = path;
  guardState.protocolHistoryDepth = marker?.depth ?? 0;
  guardState.hasAppEntryBeforeProtocol =
    marker?.hasAppEntryBeforeProtocol ?? false;
};

// Keep normal browser history while editing, then remove the entire protocol
// session only after the user confirms the exit. Rewinding to the entry before
// the protocol and pushing the target path truncates all protocol entries from
// the forward stack. A direct-load session has no in-app entry before it, so
// its first protocol entry is replaced before the final push instead.
export const collapseProtocolHistory = (
  targetPath: string,
  replaceCurrentEntry: () => void,
): void | Promise<void> => {
  const depth = guardState.protocolHistoryDepth;
  const hasAppEntryBeforeProtocol = guardState.hasAppEntryBeforeProtocol;
  const stepsBack = hasAppEntryBeforeProtocol ? depth : depth - 1;

  if (stepsBack <= 0) {
    replaceCurrentEntry();
    return;
  }

  return new Promise<void>((resolve) => {
    window.addEventListener(
      'popstate',
      () => {
        if (!hasAppEntryBeforeProtocol) {
          history.replaceState(null, '', targetPath);
        }
        history.pushState(null, '', targetPath);
        resolve();
      },
      { once: true },
    );
    history.go(-stepsBack);
  });
};

// The stage editor lives under /protocol/stage/, so leaving it can be intra-
// /protocol nav (e.g. Back to the overview) that isProtocolPath() alone misses.
export const isStageEditorPath = (path: string) =>
  path.startsWith('/protocol/stage/');

// How much of what the user sees is actually persisted. This decides both the
// leave-editor copy and whether leaving needs confirming at all, so it is
// derived in one place rather than re-asked at each call site.
export type LeavePersistence =
  | 'no-protocol'
  | 'storage-unavailable'
  | 'open-elsewhere'
  | 'reclaim-blocked'
  | 'saved';

export const getLeavePersistence = (state: RootState): LeavePersistence => {
  if (!getProtocol(state)) return 'no-protocol';
  // Nothing reached disk at all, which is more urgent than another tab holding
  // the saved copy, so it wins when both are true.
  if (getStorageUnavailable(state)) return 'storage-unavailable';
  const lockState = getProtocolLockState(state);
  if (lockState !== 'owned') return lockState;
  return 'saved';
};

// One whole string per persistence state: the dialog has to describe what is
// actually true of the user's work, and sentence fragments cannot be localised.
const leaveDescriptions: Record<
  Exclude<LeavePersistence, 'no-protocol'>,
  string
> = {
  'saved':
    "Your work is saved automatically on this device, so you can return to the editor at any time. Don't forget to download your protocol when you are ready to collect data.",
  'open-elsewhere':
    'This protocol is open in another tab, which holds the saved copy. You have been viewing it here in read-only mode, so returning to the start screen will not change your protocol.',
  'reclaim-blocked':
    'Nothing has been saved in this tab since the protocol was opened in another one. Returning to the start screen now will leave your protocol exactly as that tab saved it.',
  'storage-unavailable':
    'This protocol could not be saved on this device, so it only exists in this tab. Download it now, or your work will be lost when you return to the start screen.',
};

// The same, for leaving the PROTOCOL with uncommitted edits. Neither the stage
// draft nor an open nested editor's draft is ever persisted, so what differs
// between these is what remains AFTER discarding them.
//
// The subject is deliberately wider than "this stage": this dialog is also what
// a researcher meets when the unsaved work is a half-typed variable in the
// Codebook's type editor or a Resources editor, where no stage is involved at
// all. One whole string per state, so none of this has to be assembled.
const discardDescriptions: Record<
  Exclude<LeavePersistence, 'no-protocol'>,
  string
> = {
  'saved':
    'Changes you have made — including anything in an editor you still have open — have not been saved to the protocol. If you return to the start screen now, those changes will be discarded and the last saved version of the protocol will remain available.',
  'open-elsewhere':
    'Changes you have made — including anything in an editor you still have open — cannot be saved here, because the protocol is open in another tab which holds the saved copy. If you return to the start screen now, those changes will be discarded.',
  'reclaim-blocked':
    'Changes you have made — including anything in an editor you still have open — cannot be saved over the version the other tab saved. If you return to the start screen now, those changes will be discarded and that saved version will remain available.',
  'storage-unavailable':
    'This protocol could not be saved on this device, so nothing you have done here has been kept — including anything in an editor you still have open. Returning to the start screen now discards all of it.',
};

// Leaving with unsaved work in a nested editor, without leaving the protocol —
// navigating from the Codebook to the timeline with a half-typed variable
// editor open, say. Not persistence-keyed, unlike everything above: this
// navigation neither saves nor reloads the protocol, so the only thing at stake
// is the editor's own draft, and the lock state cannot change that outcome.
// Claiming anything about the protocol's saved state here would be inventing a
// promise this navigation does not make.
const NESTED_DRAFT_DISCARD_DESCRIPTION =
  'You have unsaved changes in an editor that is still open. If you leave now, those changes will be discarded and the rest of your protocol will be left as it is.';

// The same again for LEAVING THE STAGE EDITOR rather than the protocol: the
// stage draft is discarded either way, but what remains behind it differs, and
// a tab that cannot save must not be told its protocol is fine. One whole
// string per state, so none of this has to be assembled.
export const stageDiscardDescriptions: Record<
  Exclude<LeavePersistence, 'no-protocol'>,
  string
> = {
  'saved':
    'Changes made in this stage have not been saved to the protocol. If you leave the stage editor now, those changes will be discarded and the last saved version of the stage will remain.',
  'open-elsewhere':
    'Changes made in this stage cannot be saved here, because the protocol is open in another tab which holds the saved copy. If you leave the stage editor now, those changes will be discarded.',
  'reclaim-blocked':
    'Changes made in this stage cannot be saved over the version the other tab saved. If you leave the stage editor now, those changes will be discarded, along with any attributes you added or edited while it was open, and that saved version will be loaded here.',
  'storage-unavailable':
    'This protocol could not be saved on this device, so nothing in this editor has been kept — including the changes made in this stage. Leaving the stage editor now discards them.',
};

// Opens the leave-editor confirmation. On confirm, clears the active protocol
// and runs `performLeave` with the guard's bypass flag set so the navigation
// passes through aroundNav without re-prompting. Skips if a prompt is already
// in flight.
//
// `draftDirty` reflects whether the stage editor holds uncommitted edits. The
// stage draft is not persisted (see rememberedKeys in store.ts), so leaving with
// a dirty draft uses a separate discard dialog and resets the draft on confirm.
//
// `persistence` selects the pristine-editor copy. The reassuring "saved
// automatically" wording is only true when this tab actually owns the saved
// copy, so a tab whose writes are being dropped (storage unavailable, or the
// protocol open in another tab) gets a description of its own situation
// instead. Callers must resolve `no-protocol` themselves: there is nothing to
// confirm, and every action this dialog offers would fail.
export const promptLeaveEditor = async (
  dispatch: AppDispatch,
  openDialog: DialogContextType['openDialog'],
  performLeave: () => void | Promise<void>,
  draftDirty = false,
  persistence: Exclude<LeavePersistence, 'no-protocol'> = 'saved',
) => {
  if (guardState.prompting) return;
  guardState.prompting = true;
  try {
    const leaveAction = {
      label: 'Return to Start Screen',
      value: 'leave' as const,
    };
    const downloadAction = {
      label: 'Return and download now',
      value: 'download-and-leave' as const,
    };
    // When nothing can be written to this device, downloading is the only way
    // to keep the work, so it leads.
    const unsaved = persistence === 'storage-unavailable';

    const action = draftDirty
      ? await openDialog({
          type: 'choice',
          title: 'Discard unsaved changes?',
          description: discardDescriptions[persistence],
          intent: 'warning',
          size: 'readable',
          actions: {
            primary: {
              label: 'Discard Changes and Return',
              value: 'discard-and-leave' as const,
            },
            cancel: {
              label: 'Cancel',
              value: null,
            },
          },
        })
      : await openDialog({
          type: 'choice',
          title: 'Return to start screen?',
          description: leaveDescriptions[persistence],
          intent: unsaved ? 'warning' : 'default',
          size: 'readable',
          actions: {
            primary: unsaved ? downloadAction : leaveAction,
            secondary: unsaved ? leaveAction : downloadAction,
            cancel: {
              label: 'Cancel',
              value: null,
            },
          },
        });

    if (draftDirty && action !== 'discard-and-leave') {
      return;
    }
    if (!draftDirty && action !== 'leave' && action !== 'download-and-leave') {
      return;
    }

    if (action === 'download-and-leave') {
      const downloaded = await downloadActiveProtocol(dispatch, openDialog);
      if (!downloaded) return;
    }

    guardState.bypass = true;
    try {
      if (draftDirty) {
        dispatch(resetDraft(null));
      }
      dispatch(clearActiveProtocol());
      await performLeave();
    } finally {
      guardState.bypass = false;
    }
  } finally {
    guardState.prompting = false;
  }
};

// Opens the discard-draft confirmation when Back leaves unsaved work behind
// without leaving the protocol — either the stage editor's own uncommitted
// draft, or a nested editor left open anywhere (the Codebook's type editor, a
// Resources editor), which is not gated on the stage-editor path at all. On
// confirm, runs `performLeave` with the bypass flag set so the navigation isn't
// re-guarded, clearing the stage draft only when that draft is what is being
// discarded. Skips if a prompt is already in flight, so a single Back can never
// stack two confirmations.
const promptDiscardDraft = async (
  dispatch: AppDispatch,
  openDialog: DialogContextType['openDialog'],
  performLeave: () => void,
  // Whether the STAGE editor's own draft is what is being discarded. A dirty
  // editor elsewhere (the Codebook's type editor, a Resources editor) is just
  // as lossy and must still prompt — but resetting the stage draft for it would
  // throw away uncommitted stage work the researcher never navigated away from.
  resetStageDraft = true,
) => {
  if (guardState.prompting) return;
  guardState.prompting = true;
  try {
    const persistence = getLeavePersistence(store.getState());
    // `resetStageDraft` already distinguishes the two situations that reach
    // here, so it also selects the copy. Naming the stage — and describing what
    // will be reloaded into it — is only honest when the stage editor's own
    // draft is what is being discarded.
    const confirmed = await openDialog({
      type: 'choice',
      title: resetStageDraft
        ? 'Discard unsaved stage changes?'
        : 'Discard unsaved changes?',
      description: resetStageDraft
        ? stageDiscardDescriptions[
            persistence === 'no-protocol' ? 'saved' : persistence
          ]
        : NESTED_DRAFT_DISCARD_DESCRIPTION,
      intent: 'warning',
      size: 'readable',
      actions: {
        primary: {
          label: 'Discard Changes and Leave',
          value: true,
        },
        cancel: {
          label: 'Cancel',
          value: false,
        },
      },
    });

    if (confirmed !== true) return;

    guardState.bypass = true;
    try {
      if (resetStageDraft) {
        dispatch(resetDraft(null));
      }
      performLeave();
    } finally {
      guardState.bypass = false;
    }
  } finally {
    guardState.prompting = false;
  }
};

export const useProtocolNavGuard = () => {
  const dispatch = useAppDispatch();
  const { openDialog } = useDialog();
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Any pushState/replaceState (in-app nav, including the raw `navigate` from
    // wouter/use-browser-location used by Redux thunks) fires the synthetic
    // event wouter dispatches from its monkey-patch. Use it to keep prevPath
    // in sync with the URL at all times.
    const onPushState = () => {
      if (guardState.taggingHistory) return;

      const newPath = getFullPath();
      if (!isProtocolPath(newPath)) {
        guardState.restoringProtocolHistory = null;
        syncProtocolHistoryMarker(newPath, null);
        return;
      }

      const marker =
        guardState.restoringProtocolHistory ??
        (isProtocolPath(guardState.prevPath)
          ? {
              depth: guardState.protocolHistoryDepth + 1,
              hasAppEntryBeforeProtocol: guardState.hasAppEntryBeforeProtocol,
            }
          : { depth: 1, hasAppEntryBeforeProtocol: true });
      guardState.restoringProtocolHistory = null;
      tagCurrentProtocolHistoryEntry(marker);
      syncProtocolHistoryMarker(newPath, marker);
    };

    const onReplaceState = () => {
      if (guardState.taggingHistory) return;

      const newPath = getFullPath();
      if (!isProtocolPath(newPath)) {
        syncProtocolHistoryMarker(newPath, null);
        return;
      }

      const marker = isProtocolPath(guardState.prevPath)
        ? {
            depth: Math.max(guardState.protocolHistoryDepth, 1),
            hasAppEntryBeforeProtocol: guardState.hasAppEntryBeforeProtocol,
          }
        : { depth: 1, hasAppEntryBeforeProtocol: false };
      tagCurrentProtocolHistoryEntry(marker);
      syncProtocolHistoryMarker(newPath, marker);
    };

    const onPop = () => {
      const newPath = getFullPath();
      const oldPath = guardState.prevPath;
      const destinationMarker = isProtocolPath(newPath)
        ? (readProtocolHistoryMarker() ?? {
            depth: 1,
            hasAppEntryBeforeProtocol: false,
          })
        : null;

      if (guardState.bypass) {
        syncProtocolHistoryMarker(newPath, destinationMarker);
        return;
      }

      // Leaving the protocol entirely (Back to the start screen): confirm and,
      // on confirm, clear the active protocol and navigate home.
      const leavingProtocol =
        isProtocolPath(oldPath) && !isProtocolPath(newPath);

      // Leaving the stage editor for elsewhere in the protocol (e.g. Back to the
      // overview) with uncommitted edits: intra-/protocol nav that the
      // leavingProtocol check misses. Only prompt when the draft is actually
      // dirty, so ordinary Back from a pristine editor navigates freely.
      // The mirror of the stage form's values is debounced, so an edit made
      // in the last moment before Back is not in Redux yet. Without this the
      // guard reads a pristine draft and discards that edit silently.
      flushStageLiveValues();
      const leavingDirtyStageEditor =
        !leavingProtocol &&
        isStageEditorPath(oldPath) &&
        !isStageEditorPath(newPath) &&
        getLiveStageDraftDirty(store.getState());

      // A dirty nested editor is unsaved work wherever it is open, and any pop
      // unmounts it. Deliberately NOT gated on the stage-editor path: the
      // Codebook's type editor and the Resources editors are just as lossy, and
      // the path gates above would never reach them.
      const leavingWithDirtyNestedDraft =
        !leavingProtocol && hasDirtyNestedDraft();

      if (
        !leavingProtocol &&
        !leavingDirtyStageEditor &&
        !leavingWithDirtyNestedDraft
      ) {
        syncProtocolHistoryMarker(newPath, destinationMarker);
        return;
      }

      // With no protocol in the editing buffer there is nothing to confirm and
      // nothing to download, so Back must simply be allowed. (ProtocolRouteGuard
      // sends such a route home anyway; this keeps the two from arguing.)
      const persistence = getLeavePersistence(store.getState());
      if (persistence === 'no-protocol') {
        syncProtocolHistoryMarker(newPath, destinationMarker);
        return;
      }

      // Push the user back to where they were. pushState does not fire popstate,
      // so we don't re-enter this handler. (Our pushState listener will update
      // prevPath to oldPath, which is correct.)
      guardState.restoringProtocolHistory = destinationMarker
        ? {
            depth: destinationMarker.depth + 1,
            hasAppEntryBeforeProtocol:
              destinationMarker.hasAppEntryBeforeProtocol,
          }
        : { depth: 1, hasAppEntryBeforeProtocol: true };
      history.pushState(null, '', oldPath);

      if (leavingProtocol) {
        // A multi-step Back can jump straight from the stage editor to '/'. That
        // takes this branch, but the uncommitted (unpersisted) draft would still
        // be lost — so surface it and reset the draft on confirm.
        const draftDirty =
          (isStageEditorPath(oldPath) &&
            getLiveStageDraftDirty(store.getState())) ||
          hasDirtyNestedDraft();
        void promptLeaveEditor(
          dispatch,
          openDialog,
          () =>
            collapseProtocolHistory('/', () =>
              setLocation('/', { replace: true }),
            ),
          draftDirty,
          persistence,
        );
        return;
      }

      void promptDiscardDraft(
        dispatch,
        openDialog,
        () => setLocation(newPath),
        leavingDirtyStageEditor,
      );
    };

    window.addEventListener('popstate', onPop);
    const currentPath = getFullPath();
    if (isProtocolPath(currentPath)) {
      const marker = readProtocolHistoryMarker() ?? {
        depth: 1,
        hasAppEntryBeforeProtocol: false,
      };
      if (!readProtocolHistoryMarker()) {
        tagCurrentProtocolHistoryEntry(marker);
      }
      syncProtocolHistoryMarker(currentPath, marker);
    } else {
      syncProtocolHistoryMarker(currentPath, null);
    }

    window.addEventListener('pushState', onPushState);
    window.addEventListener('replaceState', onReplaceState);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('pushState', onPushState);
      window.removeEventListener('replaceState', onReplaceState);
    };
  }, [dispatch, openDialog, setLocation]);
};
