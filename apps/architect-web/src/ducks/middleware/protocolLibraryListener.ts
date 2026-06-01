import {
  createListenerMiddleware,
  type TypedStartListening,
} from '@reduxjs/toolkit';

import { getProtocol } from '~/selectors/protocol';
import { putStoredProtocol } from '~/utils/protocolLibrary';

import {
  setActiveProtocol,
  updateLastModified,
} from '../modules/activeProtocol';
import { getActiveProtocolId } from '../modules/app';
import type { RootState } from '../modules/root';
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

// Persist a snapshot, surfacing IndexedDB/quota errors rather than dropping the
// promise (a silent autosave failure would lose user edits without warning).
const flush = (snapshot: ProtocolSnapshot): void => {
  if (!snapshot.protocol) {
    return;
  }
  void putStoredProtocol({
    id: snapshot.id,
    protocol: snapshot.protocol,
    name: snapshot.name,
    description: snapshot.description,
  }).catch((error: unknown) => {
    console.error('Autosave to protocol library failed', error);
  });
};

// Autosave: debounce a write of the active protocol into its library row.
startAppListening({
  predicate: (action, currentState, previousState) => {
    // lastModified bumps produce a new `present` but aren't user edits.
    if (updateLastModified.match(action)) {
      return false;
    }
    // The initial library row is written by the opening thunk.
    if (setActiveProtocol.match(action)) {
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
        flush(pending.snapshot);
      }
    }

    const timer = setTimeout(() => {
      pending = null;
      flush(snapshot);
    }, DEBOUNCE_MS);

    pending = { timer, snapshot };
  },
});
