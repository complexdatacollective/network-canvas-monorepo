import { useCallback, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { navigate } from 'wouter/use-browser-location';

import {
  hasDirtyNestedDraft,
  useNestedDraftDirty,
} from '~/components/DialogForm/nestedDraftRegistry';
import { flushStageLiveValues } from '~/components/StageEditor/StageFormBridge';
import { useAppDispatch, useAppSelector, useAppStore } from '~/ducks/hooks';
import {
  getActiveProtocolId,
  getProtocolLockState,
  setProtocolLockState,
} from '~/ducks/modules/app';
import { resetDraft } from '~/ducks/modules/stageEditorDraft';
import { restoreActiveProtocolFromLibrary } from '~/ducks/restoreActiveProtocol';
import { getCanonicalProtocol } from '~/selectors/protocol';
import {
  getLiveStageDraftDirty,
  getStageEditorDraftOpen,
} from '~/selectors/stageEditorDraft';
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
  // Bumped on every exclusivity change. A refresh in flight compares it to
  // decide whether the reclaim it is completing is still the current one — the
  // lock STATE cannot answer that, because a demote/regain/demote round trip
  // lands back on the value it started from.
  const lockEpoch = useRef(0);

  // Re-read the canonical row, then hand editing back to this tab. Used both on
  // a plain re-claim and once a blocked one has been resolved, so the two can
  // never drift.
  const finishReclaim = useCallback(async () => {
    // The read is asynchronous (IndexedDB plus validation), and a peer can
    // claim the protocol while it is in flight — `onExclusivityChange(false)`
    // demotes this tab correctly, and a blind promotion afterwards would put
    // BOTH tabs back to autosaving one library row. Only hand editing back if
    // no lock event has happened since this reclaim began.
    const epoch = lockEpoch.current;
    await refreshActiveProtocol(store);
    if (lockEpoch.current !== epoch) return;
    dispatch(setProtocolLockState('owned'));
  }, [dispatch, refreshActiveProtocol, store]);

  // Give up the editor session this tab is holding, then take the saved copy.
  // The two pristine cases — never typed into, and typed into then undone all
  // the way back — are the same situation: there is nothing to weigh against
  // the saved copy, but the mounted form still cannot survive the buffer being
  // replaced (that empties its baseline, leaving an editor that reports itself
  // unchanged and can never be saved). Close it and return to the stage list,
  // where the reloaded protocol renders. The raw browser-location navigate, so
  // this does not raise the leave-editor confirmation over a move the
  // researcher never asked for.
  const closeEditorAndReclaim = useCallback(() => {
    dispatch(resetDraft(null));
    navigate('/protocol', { replace: true });
    void finishReclaim();
  }, [dispatch, finishReclaim]);

  // One lock (one BroadcastChannel) per tab, created on mount and closed on
  // unmount. lockFactory is stable; this runs once.
  useEffect(() => {
    const lock = lockFactory({
      onExclusivityChange: (exclusive) => {
        lockEpoch.current += 1;
        if (!exclusive) {
          // Losing exclusivity mid-session (a bfcache restore reclaiming a
          // protocol a peer has taken over) decides, in the very next render,
          // whether the stage editor is torn down. The stage form's mirror into
          // Redux is debounced, so flush it first rather than reading a stale
          // "pristine" and taking the last few seconds of typing with it.
          flushStageLiveValues();
          dispatch(setProtocolLockState('open-elsewhere'));
          return;
        }

        // Regaining exclusivity. The optimistic claim a tab makes on entering
        // the editor never reports a change (it starts exclusive), so this only
        // fires when a peer released a protocol this tab had been demoted from.
        if (getProtocolLockState(store.getState()) === 'owned') return;
        // …but a release also fires when THIS tab leaves the editor. Refreshing
        // then would pull a protocol back into a tab that is on its way to the
        // start screen.
        if (
          !isProtocolPath(window.location.pathname) ||
          !getActiveProtocolId(store.getState())
        ) {
          dispatch(setProtocolLockState('owned'));
          return;
        }

        // This tab's buffer is a snapshot from before the other tab took over,
        // and the row on disk has moved on if that tab edited. Re-read the
        // canonical row BEFORE editing is re-enabled, so the first commit here
        // cannot overwrite work this tab never saw.
        //
        // That re-read replaces the whole editing buffer, which closes any
        // stage editor transaction taken from the previous one (#1382) — so it
        // is not something that can be done quietly over a draft. The mirror is
        // debounced, so flush before asking whether there is one.
        flushStageLiveValues();
        const state = store.getState();

        // A nested editor (a variable, an entity type, an array row, a rule)
        // keeps its half-typed values in its own form store: they are in
        // neither the editing buffer nor the stage draft, and the editor is
        // rendered from the route tree, so BOTH ways out of here would take
        // them — the refresh below by unmounting the route, and
        // `closeEditorAndReclaim` by navigating away from it. The stage flow
        // cannot answer for them either: its download builds a file from the
        // stage draft, which would arrive missing the very work the researcher
        // was trying to keep. Stop and ask instead
        // (NestedDraftReclaimDialog); resolving the inner editor is what puts
        // its values somewhere the rest of this can reason about.
        if (hasDirtyNestedDraft()) {
          dispatch(setProtocolLockState('reclaim-blocked'));
          return;
        }

        if (!getStageEditorDraftOpen(state)) {
          void finishReclaim();
          return;
        }

        if (getLiveStageDraftDirty(state)) {
          // In-progress work that exists nowhere else, and no honest way to
          // combine it with what the other tab saved: the draft carries a whole
          // replacement codebook snapshotted before those edits. Stop here and
          // let the researcher decide (StageDraftConflictDialog). Nothing is
          // written, reloaded or discarded until they do.
          dispatch(setProtocolLockState('reclaim-blocked'));
          return;
        }

        closeEditorAndReclaim();
      },
    });
    lockRef.current = lock;
    return () => {
      lock.close();
      lockRef.current = null;
    };
  }, [lockFactory, dispatch, store, finishReclaim, closeEditorAndReclaim]);

  const lockState = useAppSelector(getProtocolLockState);
  const draftOpen = useAppSelector(getStageEditorDraftOpen);
  const draftDirty = useAppSelector(getLiveStageDraftDirty);
  // Re-read whenever a nested editor opens or closes — the two transitions that
  // can answer the question this blocks on.
  const nestedDraftDirty = useNestedDraftDirty();

  // A blocked reclaim must not outlive the thing that blocked it. The stage
  // draft may simply go — the conflict dialog's discard, the banner's, a
  // confirmed Cancel, the editor unmounting — or it may be undone back to the
  // values the editor opened on, which leaves nothing to weigh against the
  // saved copy either; a nested editor's draft goes when that editor is
  // finished or cancelled. All of them must finish the reclaim, or the tab
  // stays refusing every write with no other tab to blame and a banner
  // describing changes that no longer exist.
  const resolvingBlockedReclaim = useRef(false);
  useEffect(() => {
    if (lockState !== 'reclaim-blocked') {
      resolvingBlockedReclaim.current = false;
      return;
    }
    // A nested editor still holding unsaved work blocks the reclaim on its own,
    // whether or not a stage editor is open behind it. Finishing it moves its
    // values into the stage draft (where the stage flow's three actions then
    // apply unchanged); cancelling it takes them away by the researcher's own
    // decision. Either way it is closing that answers this.
    if (nestedDraftDirty) return;
    if (draftOpen && draftDirty) return;
    // Closing the editor below clears the draft, which re-runs this effect
    // while the reclaim it started is still in flight.
    if (resolvingBlockedReclaim.current) return;
    resolvingBlockedReclaim.current = true;
    if (
      !isProtocolPath(window.location.pathname) ||
      !getActiveProtocolId(store.getState()) ||
      // A confirmed leave clears the editing buffer before it navigates, so
      // there is nothing to refresh into and pulling the row back would fight
      // the exit for it.
      !getCanonicalProtocol(store.getState())
    ) {
      dispatch(setProtocolLockState('owned'));
      return;
    }
    if (draftOpen) {
      closeEditorAndReclaim();
      return;
    }
    void finishReclaim();
  }, [
    lockState,
    draftOpen,
    draftDirty,
    nestedDraftDirty,
    dispatch,
    finishReclaim,
    closeEditorAndReclaim,
    store,
  ]);

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
      dispatch(setProtocolLockState('owned'));
      lock.claimProtocol(activeProtocolId);
    } else {
      lock.releaseProtocol();
      dispatch(setProtocolLockState('owned'));
    }
  }, [editing, activeProtocolId, dispatch]);
};
