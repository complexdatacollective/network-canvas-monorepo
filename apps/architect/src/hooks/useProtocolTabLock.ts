import { useEffect, useRef } from 'react';
import { useLocation } from 'wouter';

import { useAppDispatch, useAppSelector } from '~/ducks/hooks';
import {
  getActiveProtocolId,
  setProtocolOpenElsewhere,
} from '~/ducks/modules/app';
import {
  createProtocolTabLock,
  type ProtocolTabLock,
} from '~/utils/protocolTabLock';

import { isProtocolPath } from './useProtocolNavGuard';

type LockFactory = (options: {
  onExclusivityChange: (exclusive: boolean) => void;
}) => ProtocolTabLock;

// Couples the cross-tab single-editor lock to actually being in the protocol
// editor. The tab claims its active protocol on the shared `BroadcastChannel`
// only while it is on a `/protocol` route, and releases it when the tab returns
// to the start screen (Home) — even though the active protocol id itself
// persists (so a reload restores the editor). This keeps a tab left idle on Home
// after editing from holding the lock and falsely blocking another tab from
// editing the same protocol.
//
// Mounted once at the app shell. The lock exists for the tab's whole session
// (also released on `pagehide` for tab close); the claim follows route + active
// protocol. `lockFactory` is injectable for tests.
export const useProtocolTabLock = (
  lockFactory: LockFactory = createProtocolTabLock,
) => {
  const [location] = useLocation();
  const activeProtocolId = useAppSelector(getActiveProtocolId);
  const dispatch = useAppDispatch();
  const lockRef = useRef<ProtocolTabLock | null>(null);

  // One lock (one BroadcastChannel) per tab, created on mount and closed on
  // unmount. lockFactory is stable; this runs once.
  useEffect(() => {
    const lock = lockFactory({
      onExclusivityChange: (exclusive) => {
        dispatch(setProtocolOpenElsewhere(!exclusive));
      },
    });
    lockRef.current = lock;
    return () => {
      lock.close();
      lockRef.current = null;
    };
  }, [lockFactory, dispatch]);

  const editing = isProtocolPath(location) && activeProtocolId !== null;

  // Hold the lock only while editing; release it on Home or when no protocol is
  // active. Runs after the create effect above, so lockRef is populated.
  useEffect(() => {
    const lock = lockRef.current;
    if (!lock) return;
    if (editing && activeProtocolId) {
      // Optimistically treat this tab as the sole editor; a "held" reply from a
      // tab already holding this protocol re-flags it read-only via the
      // exclusivity callback.
      dispatch(setProtocolOpenElsewhere(false));
      lock.claimProtocol(activeProtocolId);
    } else {
      lock.releaseProtocol();
      dispatch(setProtocolOpenElsewhere(false));
    }
  }, [editing, activeProtocolId, dispatch]);
};
