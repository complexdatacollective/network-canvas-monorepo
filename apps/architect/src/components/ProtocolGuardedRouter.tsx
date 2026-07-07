import type { ReactNode } from 'react';
import { useCallback } from 'react';
import { Router } from 'wouter';
import type { AroundNavHandler } from 'wouter';

import { useAppDispatch } from '~/ducks/hooks';
import {
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

  const aroundNav = useCallback<AroundNavHandler>(
    (nav, to, opts) => {
      const leaving =
        isProtocolPath(window.location.pathname) && !isProtocolPath(to);

      if (guardState.bypass || !leaving) {
        nav(to, opts);
        return;
      }

      void promptLeaveEditor(dispatch, () => nav(to, opts));
    },
    [dispatch],
  );

  return (
    <Router aroundNav={aroundNav}>
      <NavGuardListener />
      {children}
    </Router>
  );
};

export default ProtocolGuardedRouter;
