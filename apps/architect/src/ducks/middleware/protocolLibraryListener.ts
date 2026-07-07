import {
  createListenerMiddleware,
  type TypedStartListening,
} from '@reduxjs/toolkit';
import { REMEMBER_REHYDRATED } from 'redux-remember';

import { getProtocol } from '~/selectors/protocol';
import { assetDb } from '~/utils/assetDB';
import { getStoredProtocol, putStoredProtocol } from '~/utils/protocolLibrary';

import { reconcileRehydratedActiveProtocol } from '../activeProtocolPersistence';
import {
  clearActiveProtocol,
  setActiveProtocol,
  updateLastModified,
} from '../modules/activeProtocol';
import {
  getActiveProtocolId,
  getProtocolOpenElsewhere,
  getStorageUnavailable,
  setActiveProtocolId,
} from '../modules/app';
import type { RootState } from '../modules/root';
import { generalErrorDialog } from '../modules/userActions/dialogs';
import type { AppDispatch } from '../store';

const DEBOUNCE_MS = 600;

export const protocolLibraryListenerMiddleware = createListenerMiddleware();

type AppStartListening = TypedStartListening<RootState, AppDispatch>;
const startAppListening =
  protocolLibraryListenerMiddleware.startListening as AppStartListening;

type ProtocolSnapshot = {
  id: string;
  protocol: ReturnType<typeof getProtocol>;
  name: string;
  description?: string;
};

let pending: {
  timer: ReturnType<typeof setTimeout>;
  snapshot: ProtocolSnapshot;
} | null = null;

// Whether the user has already been warned about the current autosave-failure
// streak. Throttles the dialog to once per streak (it fires on every debounced
// save otherwise) and resets on the next successful save.
let autosaveErrorNotified = false;

const writeLocks = new Map<string, Promise<void>>();

// Persist a snapshot. A silent autosave failure would let the user keep editing
// while their work isn't being saved, so surface it to them (throttled) and log
// the details rather than dropping the promise.
const flush = (snapshot: ProtocolSnapshot, dispatch: AppDispatch): void => {
  const { protocol } = snapshot;
  if (!protocol) {
    return;
  }

  const previous = writeLocks.get(snapshot.id) ?? Promise.resolve();
  const run = (async () => {
    await previous;
    try {
      // A pending timer can fire after the protocol was deleted. The existence
      // check and the put run in one transaction on `protocols` so a delete
      // (which locks `protocols`) can't land between them and resurrect the row.
      // `assets` is in scope too because putStoredProtocol GCs orphaned blobs
      // from that table; omitting it makes Dexie throw NotFoundError, which the
      // best-effort GC swallows and leaves the orphan undeleted.
      await assetDb.transaction(
        'rw',
        assetDb.protocols,
        assetDb.assets,
        async () => {
          const existing = await getStoredProtocol(snapshot.id);
          if (!existing) {
            return;
          }
          await putStoredProtocol({
            id: snapshot.id,
            protocol,
            name: snapshot.name,
            description: snapshot.description,
          });
        },
      );
      autosaveErrorNotified = false;
    } catch (error: unknown) {
      console.error('Autosave to protocol library failed', error);
      if (!autosaveErrorNotified) {
        autosaveErrorNotified = true;
        void dispatch(
          generalErrorDialog(
            'Autosave failed',
            "Your recent changes could not be saved to this browser's " +
              'storage, which can happen if it is full or unavailable. To ' +
              'avoid losing work, download a copy of your protocol.',
          ),
        );
      }
    }
  })();

  writeLocks.set(snapshot.id, run);
  void run.finally(() => {
    if (writeLocks.get(snapshot.id) === run) {
      writeLocks.delete(snapshot.id);
    }
  });
};

// Reconcile a rehydrated protocol on reload. redux-remember persists the `app`
// (which holds `activeProtocolId`) and `activeProtocol` keys non-atomically, so a
// reload catching a partial intra-tab write can rehydrate a NEW id paired with
// the PREVIOUS protocol's present. Autosaving that pair would flush the old
// content into the new library row, so validate the stamped owner id against the
// rehydrated `app.activeProtocolId` and discard the suspect present (and the
// stale id) before any autosave runs. This listener is registered before the
// autosave listener so it corrects the state first for the same rehydrate action.
startAppListening({
  predicate: (action) => action.type === REMEMBER_REHYDRATED,
  effect: (_action, listenerApi) => {
    const state = listenerApi.getState();
    const { clearActiveProtocolId } = reconcileRehydratedActiveProtocol(
      state.activeProtocol,
      getActiveProtocolId(state),
    );

    if (clearActiveProtocolId) {
      listenerApi.dispatch(clearActiveProtocol());
      listenerApi.dispatch(setActiveProtocolId(null));
    }
  },
});

// Autosave: debounce a write of the active protocol into its library row.
startAppListening({
  predicate: (action, currentState, previousState) => {
    // Rehydration on reload is not a user edit; the id/present reconcile above
    // owns it, and autosaving here could flush a suspect rehydrated present.
    if (action.type === REMEMBER_REHYDRATED) {
      return false;
    }
    // lastModified bumps produce a new `present` but aren't user edits.
    if (updateLastModified.match(action)) {
      return false;
    }
    // The initial library row is written by the opening thunk.
    if (setActiveProtocol.match(action)) {
      return false;
    }

    // Nothing was persisted for an in-memory (storage-unavailable) protocol, so
    // skip autosave entirely rather than failing on every edit.
    if (getStorageUnavailable(currentState)) {
      return false;
    }

    // The same protocol is open in another tab, which owns the single library
    // row. This tab is a read-only view; skip autosave so the two tabs can't
    // clobber each other's writes.
    if (getProtocolOpenElsewhere(currentState)) {
      return false;
    }

    const current = getProtocol(currentState);
    const previous = getProtocol(previousState);

    return (
      current !== null &&
      current !== previous &&
      getActiveProtocolId(currentState) !== null
    );
  },
  effect: (_action, listenerApi) => {
    const { dispatch } = listenerApi;
    const state = listenerApi.getState();
    const protocol = getProtocol(state);
    const id = getActiveProtocolId(state);

    if (!protocol || !id) {
      return;
    }

    // Snapshot the protocol at schedule time so a switch/delete during the
    // debounce window can't make the timer save the wrong (later) protocol.
    const snapshot: ProtocolSnapshot = {
      id,
      protocol,
      name: protocol.name,
      description: protocol.description,
    };

    if (pending !== null) {
      clearTimeout(pending.timer);
      // The active protocol changed mid-window: flush the previous edits now so
      // they aren't discarded when we re-debounce for the new protocol.
      if (pending.snapshot.id !== snapshot.id) {
        flush(pending.snapshot, dispatch);
      }
    }

    const timer = setTimeout(() => {
      pending = null;
      flush(snapshot, dispatch);
    }, DEBOUNCE_MS);

    pending = { timer, snapshot };
  },
});
