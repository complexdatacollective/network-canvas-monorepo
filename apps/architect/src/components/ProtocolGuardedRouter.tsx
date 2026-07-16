import type { ReactNode } from 'react';
import { useCallback } from 'react';
import { Router } from 'wouter';
import type { AroundNavHandler } from 'wouter';

import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import { useAppDispatch } from '~/ducks/hooks';
import { store } from '~/ducks/store';
import {
  collapseProtocolHistory,
  guardState,
  isProtocolPath,
  promptLeaveEditor,
  useProtocolNavGuard,
} from '~/hooks/useProtocolNavGuard';
import { getStageDraftDirty } from '~/selectors/stageEditorDraft';

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

      if (guardState.bypass || !leaving) {
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
        getStageDraftDirty(store.getState()),
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
