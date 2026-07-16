import { useEffect } from 'react';
import { useLocation } from 'wouter';

import type { DialogContextType } from '@codaco/fresco-ui/dialogs/DialogProvider';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import { useAppDispatch } from '~/ducks/hooks';
import { clearActiveProtocol } from '~/ducks/modules/activeProtocol';
import { resetDraft } from '~/ducks/modules/stageEditorDraft';
import type { AppDispatch } from '~/ducks/store';
import { store } from '~/ducks/store';
import { getStageDraftDirty } from '~/selectors/stageEditorDraft';

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
const isStageEditorPath = (path: string) => path.startsWith('/protocol/stage/');

// Opens the leave-editor confirmation. On confirm, clears the active protocol
// and runs `performLeave` with the guard's bypass flag set so the navigation
// passes through aroundNav without re-prompting. Skips if a prompt is already
// in flight.
//
// `draftDirty` reflects whether the stage editor holds uncommitted edits. The
// stage draft is not persisted (see rememberedKeys in store.ts), so leaving with
// a dirty draft loses those edits: warn accordingly and reset the draft on
// confirm. A pristine editor keeps the reassuring "saved automatically" copy.
export const promptLeaveEditor = async (
  dispatch: AppDispatch,
  openDialog: DialogContextType['openDialog'],
  performLeave: () => void | Promise<void>,
  draftDirty = false,
) => {
  if (guardState.prompting) return;
  guardState.prompting = true;
  try {
    const dialogConfig = draftDirty
      ? {
          intent: 'warning' as const,
          title: 'Return to start screen?',
          description:
            'You have unsaved changes in the stage editor that will be lost if you leave now. Are you sure you want to return to the start screen?',
          confirmLabel: 'Discard Changes and Leave',
        }
      : {
          intent: 'default' as const,
          title: 'Return to start screen?',
          description:
            "Your work is saved automatically in your browser, so you can return to the editor at any time. Don't forget to download your protocol when you are ready to collect data.",
          confirmLabel: 'Return to Start Screen',
        };

    const confirmed = await openDialog({
      type: 'choice',
      title: dialogConfig.title,
      description: dialogConfig.description,
      intent: dialogConfig.intent,
      size: 'readable',
      actions: {
        primary: {
          label: dialogConfig.confirmLabel,
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

// Opens the discard-draft confirmation when Back leaves the stage editor with an
// uncommitted draft. On confirm, clears the draft and runs `performLeave` with
// the bypass flag set so the navigation isn't re-guarded. Skips if a prompt is
// already in flight.
const promptDiscardDraft = async (
  dispatch: AppDispatch,
  openDialog: DialogContextType['openDialog'],
  performLeave: () => void,
) => {
  if (guardState.prompting) return;
  guardState.prompting = true;
  try {
    const confirmed = await openDialog({
      type: 'choice',
      title: 'Unsaved Changes',
      description:
        'You have unsaved changes. Are you sure you want to leave without saving?',
      intent: 'warning',
      size: 'readable',
      actions: {
        primary: {
          label: 'Leave Without Saving',
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
      dispatch(resetDraft(null));
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
      const leavingDirtyStageEditor =
        !leavingProtocol &&
        isStageEditorPath(oldPath) &&
        !isStageEditorPath(newPath) &&
        getStageDraftDirty(store.getState());

      if (!leavingProtocol && !leavingDirtyStageEditor) {
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
          isStageEditorPath(oldPath) && getStageDraftDirty(store.getState());
        void promptLeaveEditor(
          dispatch,
          openDialog,
          () =>
            collapseProtocolHistory('/', () =>
              setLocation('/', { replace: true }),
            ),
          draftDirty,
        );
        return;
      }

      void promptDiscardDraft(dispatch, openDialog, () => setLocation(newPath));
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
