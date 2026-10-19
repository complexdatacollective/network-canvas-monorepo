import { useCallback } from 'react';

import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import { hasDirtyNestedDraft } from '~/components/DialogForm/nestedDraftRegistry';
import { readStageDraft } from '~/components/StageEditor/stageDraftBeacon';
import { useAppDispatch, useAppStore } from '~/ducks/hooks';
import {
  collapseProtocolHistory,
  getLeavePersistence,
  promptLeaveEditor,
} from '~/hooks/useProtocolNavGuard';
import { navigateApp, toBrowserPath } from '~/utils/appBase';
import { leaveForArchitect9 } from '~/utils/architect9Handoff';
import { whenCriticalOperationsSettle } from '~/utils/criticalOperation';

const hasUnsavedEditorWork = (): boolean =>
  readStageDraft().dirty || hasDirtyNestedDraft();

// After a confirmed discard the editor unmounts on the next render, taking its
// `beforeunload` listeners with it. Navigating before then would raise the
// browser's own "leave site?" prompt over the one just answered. Bounded, so
// a draft that never reports clean cannot strand the researcher.
const whenEditorsClosed = async (): Promise<void> => {
  for (let attempt = 0; attempt < 60 && hasUnsavedEditorWork(); attempt += 1) {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 16);
    });
  }
};

type NavigateOptions = {
  /**
   * Refuse unless this tab owns the saved copy of the open protocol, as an
   * upgrade must: Architect 9 reads the library row, and a tab that is
   * read-only, or that could not save at all, does not hold what is on screen.
   */
  requireSavedProtocol?: boolean;
};

/**
 * Leave for Architect 9 (a full-page navigation to another app), without
 * losing work:
 *
 * 1. unsaved work in an open editor goes through the leave-editor prompt, and
 *    a cancel stays here;
 * 2. in-flight commits, imports and exports finish first;
 * 3. only then does the page navigate.
 *
 * `url` may be a function, read only at the moment of leaving, so a caller
 * can leave for whatever is newest by then. Resolves whether it navigated.
 */
export const useNavigateToArchitect9 = () => {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const { openDialog } = useDialog();

  return useCallback(
    async (
      url: string | (() => string),
      options: NavigateOptions = {},
    ): Promise<boolean> => {
      const refused = () => {
        if (!options.requireSavedProtocol) return false;
        const persistence = getLeavePersistence(store.getState());
        return persistence !== 'saved' && persistence !== 'no-protocol';
      };
      if (refused()) return false;

      // The tab can lose its lock at any point while this waits, and a
      // confirmed leave clears the protocol before the prompt returns, after
      // which a check can no longer see that loss. So watch for it from here
      // until the page is about to navigate.
      let lostOwnership = false;
      const unsubscribe = store.subscribe(() => {
        if (refused()) lostOwnership = true;
      });
      try {
        await whenCriticalOperationsSettle();

        if (hasUnsavedEditorWork()) {
          const persistence = getLeavePersistence(store.getState());
          if (persistence !== 'no-protocol') {
            let confirmed = false;
            // The same discard confirmation as leaving the editor any other
            // way. A confirmed leave clears the protocol and returns to the
            // start screen, so Back from Architect 9 lands there rather than
            // in an editor whose draft was just discarded.
            await promptLeaveEditor(
              dispatch,
              openDialog,
              () => {
                confirmed = true;
                return collapseProtocolHistory(toBrowserPath('/'), () =>
                  navigateApp('/', { replace: true }),
                );
              },
              true,
              persistence,
            );
            if (!confirmed) return false;
            await whenCriticalOperationsSettle();
            await whenEditorsClosed();
          }
        }
      } finally {
        unsubscribe();
      }

      if (lostOwnership || refused()) return false;
      leaveForArchitect9(typeof url === 'function' ? url() : url);
      return true;
    },
    [dispatch, store, openDialog],
  );
};
