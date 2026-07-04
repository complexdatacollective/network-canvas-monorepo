import { configureStore, type Reducer } from '@reduxjs/toolkit';
import {
  PersistError,
  REMEMBER_REHYDRATED,
  rememberEnhancer,
  rememberReducer,
} from 'redux-remember';

import { setActiveProtocolScope } from '~/utils/activeProtocolScope';
import { reportError } from '~/utils/reportError';

import {
  reconcileRehydratedActiveProtocol,
  serializeActiveProtocol,
} from './activeProtocolPersistence';
import { analyticsListenerMiddleware } from './middleware/analyticsListener';
import logger from './middleware/logger';
import { protocolLibraryListenerMiddleware } from './middleware/protocolLibraryListener';
import { protocolValidationListenerMiddleware } from './middleware/protocolValidationListener';
import { scrollPositionsListenerMiddleware } from './middleware/scrollPositionsListener';
import { stageEditorDraftListenerMiddleware } from './middleware/stageEditorDraftListener';
import { getActiveProtocolId, setStorageUnavailable } from './modules/app';
import type { RootState } from './modules/root';
import { rootReducer } from './modules/root';

const rememberedKeys = ['app', 'activeProtocol'];

// On rehydrate, redux-remember merges the persisted keys into one state and
// dispatches REMEMBER_REHYDRATED through the wrapped reducer. This is the only
// point that sees both `app.activeProtocolId` and the persisted `activeProtocol`
// together, so reconcile the (possibly cross-tab-mismatched) pair here before
// the slice reducers run.
const reconcilingRootReducer: Reducer<RootState> = (state, action) => {
  if (action.type === REMEMBER_REHYDRATED && state) {
    const appActiveProtocolId = getActiveProtocolId(state);
    const { activeProtocol, clearActiveProtocolId } =
      reconcileRehydratedActiveProtocol(
        state.activeProtocol,
        appActiveProtocolId,
      );

    const app = clearActiveProtocolId
      ? { ...state.app, activeProtocolId: null }
      : state.app;

    return rootReducer({ ...state, app, activeProtocol }, action);
  }

  return rootReducer(state, action);
};

const reducer = rememberReducer(reconcilingRootReducer);

// The custom serialize (below) needs `app.activeProtocolId` to stamp the
// persisted protocol, but serialize is defined before the store exists.
// serialize only runs on store.subscribe (after creation), so this ref is
// populated by the time it is read.
let storeRef: { getState: () => RootState; dispatch: AppDispatch } | null =
  null;

const serialize = (data: unknown, key: string): string => {
  if (key === 'activeProtocol') {
    const activeProtocolId = storeRef
      ? getActiveProtocolId(storeRef.getState())
      : null;
    return serializeActiveProtocol(data, activeProtocolId);
  }
  return JSON.stringify(data);
};

// A quota failure (the persisted undo history outgrowing localStorage) would
// otherwise be swallowed by redux-remember's default console.warn, leaving
// persistence silently broken. Route it through the storage-unavailable path so
// the user sees the "download a copy" banner instead of losing work unknowingly.
const persistErrorHandler = (error: unknown): void => {
  if (error instanceof PersistError) {
    storeRef?.dispatch(setStorageUnavailable(true));
    return;
  }
  reportError(error);
};

const store = configureStore({
  reducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
      immutableCheck: {
        warnAfter: 32, // Warn after 32ms to catch performance issues
        ignorePaths: ['form', 'dialogs'], // Ignore paths with functions/non-serializable data
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
      rememberEnhancer(window.localStorage, rememberedKeys, {
        serialize,
        errorHandler: persistErrorHandler,
      }) as unknown as ReturnType<typeof getDefaultEnhancers>[0],
    ),
});

storeRef = store;

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
