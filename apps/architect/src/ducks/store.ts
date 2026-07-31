import { configureStore } from '@reduxjs/toolkit';
import {
  MigrateError,
  REMEMBER_REHYDRATED,
  RehydrateError,
  rememberEnhancer,
  rememberReducer,
} from 'redux-remember';

import { setActiveProtocolScope } from '~/utils/activeProtocolScope';
import { reportError } from '~/utils/reportError';
import { createSessionStorageDriver } from '~/utils/sessionStorageDriver';

import { analyticsListenerMiddleware } from './middleware/analyticsListener';
import logger from './middleware/logger';
import { protocolLibraryListenerMiddleware } from './middleware/protocolLibraryListener';
import { protocolValidationListenerMiddleware } from './middleware/protocolValidationListener';
import { scrollPositionsListenerMiddleware } from './middleware/scrollPositionsListener';
import { stageEditorDraftListenerMiddleware } from './middleware/stageEditorDraftListener';
import { getActiveProtocolId } from './modules/app';
import type { RootState } from './modules/root';
import { rootReducer } from './modules/root';
import { createStoreRehydrationGate } from './storeRehydration';

// sessionStorage remembers only which library row this tab had open. Protocol
// content and its canonical validity live exclusively in IndexedDB; the undo
// timeline is intentionally session-local and starts fresh after reload.
const rememberedKeys = ['app'];
const rememberDriver = createSessionStorageDriver();
const serialize = (data: unknown): string => JSON.stringify(data);
const unserialize = (data: string): unknown => JSON.parse(data);

const rehydrationGate = createStoreRehydrationGate();
export const storeRehydrated = rehydrationGate.promise;

const rememberedReducer = rememberReducer(rootReducer);
const reducer: typeof rootReducer = (state, action) => {
  // If session restoration stalls, startup continues with the initial state.
  // Ignore a late payload so it cannot install an active id after the matching
  // canonical IndexedDB restore opportunity has passed.
  if (
    action.type === REMEMBER_REHYDRATED &&
    rehydrationGate.getResult() === 'timed-out'
  ) {
    return rootReducer(state, action);
  }

  const nextState = rememberedReducer(state, action);
  if (action.type === REMEMBER_REHYDRATED) {
    // Promise continuations run after this dispatch completes, so startup sees
    // the fully rehydrated activeProtocolId before reading IndexedDB.
    rehydrationGate.settle('rehydrated');
  }
  return nextState;
};

const handleRememberError = (error: unknown): void => {
  reportError(error, { operation: 'session-state-persistence' });
  if (error instanceof RehydrateError || error instanceof MigrateError) {
    rehydrationGate.settle('failed');
  }
};

const store = configureStore({
  reducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
      immutableCheck: {
        warnAfter: 32, // Warn after 32ms to catch performance issues
        ignorePaths: ['form'], // Ignore paths with functions/non-serializable data
      },
      // thunk is included by default in RTK
    })
      .concat(import.meta.env.DEV ? [logger] : [])
      .prepend(protocolValidationListenerMiddleware.middleware)
      .prepend(protocolLibraryListenerMiddleware.middleware)
      .prepend(analyticsListenerMiddleware.middleware)
      .prepend(scrollPositionsListenerMiddleware.middleware)
      .prepend(stageEditorDraftListenerMiddleware.middleware),
  enhancers: (getDefaultEnhancers) =>
    getDefaultEnhancers().concat(
      rememberEnhancer(rememberDriver, rememberedKeys, {
        serialize,
        unserialize,
        errorHandler: handleRememberError,
      }) as unknown as ReturnType<typeof getDefaultEnhancers>[0],
    ),
});

// Keep the non-redux asset scope in sync with the persisted active protocol id,
// so asset utils resolve against the right protocol after dispatches and after
// redux-remember rehydration on reload.
let lastScopeId = getActiveProtocolId(store.getState());
setActiveProtocolScope(lastScopeId);
store.subscribe(() => {
  const id = getActiveProtocolId(store.getState());
  if (id !== lastScopeId) {
    lastScopeId = id;
    setActiveProtocolScope(id);
  }
});

export { store };

// Export types for use throughout the application
export type AppDispatch = typeof store.dispatch;
export type { RootState };
