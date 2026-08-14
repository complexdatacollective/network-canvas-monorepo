import { useEffect, useRef } from 'react';
import { useLocation } from 'wouter';

import { flushStageLiveValues } from '~/components/StageEditor/StageFormBridge';
import { useAppDispatch, useAppSelector, useAppStore } from '~/ducks/hooks';
import {
  getActiveProtocolId,
  getProtocolOpenElsewhere,
  setProtocolOpenElsewhere,
} from '~/ducks/modules/app';
import { restoreActiveProtocolFromLibrary } from '~/ducks/restoreActiveProtocol';
import {
  createProtocolTabLock,
  type ProtocolTabLock,
} from '~/utils/protocolTabLock';

import { isProtocolPath } from './useProtocolNavGuard';

type LockFactory = (options: {
  onExclusivityChange: (exclusive: boolean) => void;
}) => ProtocolTabLock;

type RefreshActiveProtocol = typeof restoreActiveProtocolFromLibrary;

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
  refreshActiveProtocol: RefreshActiveProtocol = restoreActiveProtocolFromLibrary,
) => {
  const [location] = useLocation();
  const activeProtocolId = useAppSelector(getActiveProtocolId);
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const lockRef = useRef<ProtocolTabLock | null>(null);

  // One lock (one BroadcastChannel) per tab, created on mount and closed on
  // unmount. lockFactory is stable; this runs once.
  useEffect(() => {
    const lock = lockFactory({
      onExclusivityChange: (exclusive) => {
        if (!exclusive) {
          // Losing exclusivity mid-session (a bfcache restore reclaiming a
          // protocol a peer has taken over) decides, in the very next render,
          // whether the stage editor is torn down. The stage form's mirror into
          // Redux is debounced, so flush it first rather than reading a stale
          // "pristine" and taking the last few seconds of typing with it.
          flushStageLiveValues();
          dispatch(setProtocolOpenElsewhere(true));
          return;
        }

        // Regaining exclusivity. The optimistic claim a tab makes on entering
        // the editor never reports a change (it starts exclusive), so this only
        // fires when a peer released a protocol this tab had been demoted from.
        if (!getProtocolOpenElsewhere(store.getState())) return;
        // …but a release also fires when THIS tab leaves the editor. Refreshing
        // then would pull a protocol back into a tab that is on its way to the
        // start screen.
        if (
          !isProtocolPath(window.location.pathname) ||
          !getActiveProtocolId(store.getState())
        ) {
          dispatch(setProtocolOpenElsewhere(false));
          return;
        }

        // This tab's buffer is a snapshot from before the other tab took over,
        // and the row on disk has moved on if that tab edited. Re-read the
        // canonical row BEFORE editing is re-enabled, so the first commit here
        // cannot overwrite work this tab never saw. (A stage draft lives in its
        // own slice and survives, so it commits onto the refreshed protocol.)
        void (async () => {
          await refreshActiveProtocol(store);
          dispatch(setProtocolOpenElsewhere(false));
        })();
      },
    });
    lockRef.current = lock;
    return () => {
      lock.close();
      lockRef.current = null;
    };
  }, [lockFactory, dispatch, store, refreshActiveProtocol]);

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
