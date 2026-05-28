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

let pendingTimer: ReturnType<typeof setTimeout> | null = null;

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
    if (pendingTimer !== null) {
      clearTimeout(pendingTimer);
    }

    pendingTimer = setTimeout(() => {
      pendingTimer = null;

      const state = listenerApi.getState();
      const protocol = getProtocol(state);
      const id = getActiveProtocolId(state);

      if (!protocol || !id) {
        return;
      }

      void putStoredProtocol({
        id,
        protocol,
        name: protocol.name,
        description: protocol.description,
      });
    }, DEBOUNCE_MS);
  },
});
