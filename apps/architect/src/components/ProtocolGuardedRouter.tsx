import type { ReactNode } from 'react';
import { useCallback } from 'react';
import { Router } from 'wouter';
import type { AroundNavHandler } from 'wouter';

import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import { hasDirtyNestedDraft } from '~/components/DialogForm/nestedDraftRegistry';
import { flushStageLiveValues } from '~/components/StageEditor/StageFormBridge';
import { useAppDispatch } from '~/ducks/hooks';
import { store } from '~/ducks/store';
import {
  collapseProtocolHistory,
  getLeavePersistence,
  guardState,
  isProtocolPath,
  promptLeaveEditor,
  useProtocolNavGuard,
} from '~/hooks/useProtocolNavGuard';
import { getLiveStageDraftDirty } from '~/selectors/stageEditorDraft';

const NavGuardListener = () => {
  useProtocolNavGuard();
  return null;
};

type ProtocolGuardedRouterProps = {
  children: ReactNode;
};

const ProtocolGuardedRouter = ({ children }: ProtocolGuardedRouterProps) => {
  const dispatch = useAppDispatch();
  const { openDialog } = useDialog();

  const aroundNav = useCallback<AroundNavHandler>(
    (nav, to, opts) => {
      const leaving =
        isProtocolPath(window.location.pathname) && !isProtocolPath(to);

      // With no protocol in the editing buffer there is nothing to confirm and
      // nothing to download: prompting would offer actions that cannot succeed
      // and then strand the user on a route ProtocolRouteGuard is already
      // sending home.
      const persistence = getLeavePersistence(store.getState());

      if (guardState.bypass || !leaving || persistence === 'no-protocol') {
        nav(to, opts);
        return;
      }

      // The stage form's mirror into Redux is debounced, so the edit the user
      // made in the moment before pressing "Return to start screen" is not
      // there yet. Reading the dirty flag without flushing first shows the
      // reassuring "your work is saved automatically" dialog over an edit that
      // is about to be thrown away — the same flush the popstate guard in
      // `useProtocolNavGuard` already performs for Back.
      flushStageLiveValues();

      void promptLeaveEditor(
        dispatch,
        openDialog,
        () =>
          collapseProtocolHistory(to, () =>
            nav(to, { ...opts, replace: true }),
          ),
        // A nested editor left open holds unsaved work that the stage form's
        // mirror knows nothing about; without this the researcher is shown the
        // reassuring "saved automatically" copy over a draft about to be lost.
        getLiveStageDraftDirty(store.getState()) || hasDirtyNestedDraft(),
        // ...and `persistence` still decides WHICH discard copy that is, so a
        // tab that cannot save is never told the protocol behind the draft is
        // fine.
        persistence,
      );
    },
    [dispatch, openDialog],
  );

  return (
    <Router aroundNav={aroundNav}>
      <NavGuardListener />
      {children}
    </Router>
  );
};

export default ProtocolGuardedRouter;
