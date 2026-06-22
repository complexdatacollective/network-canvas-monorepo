import { configureStore } from '@reduxjs/toolkit';
import { rememberEnhancer, rememberReducer } from 'redux-remember';

import { setActiveProtocolScope } from '~/utils/activeProtocolScope';

import { analyticsListenerMiddleware } from './middleware/analyticsListener';
import logger from './middleware/logger';
import { protocolLibraryListenerMiddleware } from './middleware/protocolLibraryListener';
import { protocolValidationListenerMiddleware } from './middleware/protocolValidationListener';
import { scrollPositionsListenerMiddleware } from './middleware/scrollPositionsListener';
import { stageEditorDraftListenerMiddleware } from './middleware/stageEditorDraftListener';
import { getActiveProtocolId } from './modules/app';
import type { RootState } from './modules/root';
import { rootReducer } from './modules/root';

const rememberedKeys = ['app', 'activeProtocol'];

const reducer = rememberReducer(rootReducer);

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
      rememberEnhancer(
        window.localStorage,
        rememberedKeys,
      ) as unknown as ReturnType<typeof getDefaultEnhancers>[0],
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
