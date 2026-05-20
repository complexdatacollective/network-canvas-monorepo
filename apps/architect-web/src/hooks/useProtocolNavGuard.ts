import { useEffect } from 'react';
import { useLocation } from 'wouter';

import { useAppDispatch } from '~/ducks/hooks';
import { clearActiveProtocol } from '~/ducks/modules/activeProtocol';
import { actionCreators as dialogActions } from '~/ducks/modules/dialogs';
import type { AppDispatch } from '~/ducks/store';

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

export const guardState = {
  bypass: false,
  prompting: false,
  prevPath: getFullPath(),
};

// path may include a search/hash suffix; pathname always comes first, so a
// prefix check still correctly identifies protocol routes.
export const isProtocolPath = (path: string) => path.startsWith('/protocol');

// Opens the leave-editor confirmation. On confirm, clears the active protocol
// and runs `performLeave` with the guard's bypass flag set so the navigation
// passes through aroundNav without re-prompting. Skips if a prompt is already
// in flight.
export const promptLeaveEditor = async (
  dispatch: AppDispatch,
  performLeave: () => void,
) => {
  if (guardState.prompting) return;
  guardState.prompting = true;
  try {
    await dispatch(
      dialogActions.openDialog({
        type: 'Warning',
        title: 'Clear Editor?',
        message:
          'Leaving the editor will clear the current protocol. If you have made changes to your protocol, please ensure you have downloaded the updated version before proceeding.',
        confirmLabel: 'Leave Editor',
        onConfirm: () => {
          guardState.bypass = true;
          dispatch(clearActiveProtocol());
          performLeave();
          guardState.bypass = false;
        },
      }),
    );
  } finally {
    guardState.prompting = false;
  }
};

export const useProtocolNavGuard = () => {
  const dispatch = useAppDispatch();
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Any pushState/replaceState (in-app nav, including the raw `navigate` from
    // wouter/use-browser-location used by Redux thunks) fires the synthetic
    // event wouter dispatches from its monkey-patch. Use it to keep prevPath
    // in sync with the URL at all times.
    const updatePrevPath = () => {
      guardState.prevPath = getFullPath();
    };

    const onPop = () => {
      const newPath = getFullPath();
      const oldPath = guardState.prevPath;
      const leaving = isProtocolPath(oldPath) && !isProtocolPath(newPath);

      if (!leaving || guardState.bypass) {
        guardState.prevPath = newPath;
        return;
      }

      // Push the user back to where they were. pushState does not fire popstate,
      // so we don't re-enter this handler. (Our pushState listener will update
      // prevPath to oldPath, which is correct.)
      history.pushState(null, '', oldPath);

      void promptLeaveEditor(dispatch, () => setLocation('/'));
    };

    window.addEventListener('popstate', onPop);
    window.addEventListener('pushState', updatePrevPath);
    window.addEventListener('replaceState', updatePrevPath);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('pushState', updatePrevPath);
      window.removeEventListener('replaceState', updatePrevPath);
    };
  }, [dispatch, setLocation]);
};
