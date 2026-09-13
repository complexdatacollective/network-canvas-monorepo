import { type ReactNode, useCallback } from 'react';
import { Router, type AroundNavHandler } from 'wouter';

import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import { hasDirtyNestedDraft } from '~/components/DialogForm/nestedDraftRegistry';
import { readStageDraft } from '~/components/StageEditor/stageDraftBeacon';
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
        readStageDraft().dirty || hasDirtyNestedDraft(),
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
