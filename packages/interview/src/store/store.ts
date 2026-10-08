'use client';

import {
  combineReducers,
  configureStore,
  type Middleware,
} from '@reduxjs/toolkit';
import { omit } from 'es-toolkit';
import { useDispatch } from 'react-redux';

import { NULL_TRACKER, type Tracker } from '../analytics/tracker';
import type {
  InterviewPayload,
  ProtocolLocaleChangeHandler,
  SyncHandler,
} from '../contract/types';
import { createAnalyticsListenerMiddleware } from './middleware/analyticsListener';
import { createLocaleChangeMiddleware } from './middleware/localeChangeMiddleware';
import { createLoggerMiddleware } from './middleware/logger';
import { createSyncMiddleware } from './middleware/syncMiddleware';
import { createWritesInFlightMiddleware } from './middleware/writesInFlight';
import protocol from './modules/protocol';
import session from './modules/session';
import ui from './modules/ui';
import { createSecretRedactors } from './redactSecrets';

const rootReducer = combineReducers({
  session,
  protocol,
  ui,
});

type StoreOptions = {
  onSync: SyncHandler;
  onProtocolLocaleChange: ProtocolLocaleChangeHandler;
  isDevelopment?: boolean;
  extraMiddleware?: Middleware[];
  tracker?: Tracker;
};

export const store = (
  { session: sessionPayload, protocol: protocolPayload }: InterviewPayload,
  options: StoreOptions,
) => {
  const { middleware: syncMiddleware, flush } = createSyncMiddleware({
    onSync: options.onSync,
  });
  const { middleware: localeChangeMiddleware, settled: localeChangesSettled } =
    createLocaleChangeMiddleware({
      onProtocolLocaleChange: options.onProtocolLocaleChange,
    });
  const {
    middleware: writesInFlightMiddleware,
    writesSettled,
    trackWrite,
  } = createWritesInFlightMiddleware();
  // A write still protecting its answers is stored before they are handed to
  // the host, and the result says whether every write under way was stored,
  // so finishing or closing can stay when one was refused. While the page
  // unloads there is no time to wait for them. Exports read the recorded
  // locale, so whatever ends the session waits for the locale write as well
  // as the session write.
  const flushSync = async (flushOptions?: { unloading?: boolean }) => {
    const settling = flushOptions?.unloading ? undefined : writesSettled();
    const stored = (await settling) ?? true;
    await Promise.all([flush(flushOptions), localeChangesSettled()]);
    return stored;
  };
  const tracker = options.tracker ?? NULL_TRACKER;
  const analyticsMiddleware = createAnalyticsListenerMiddleware({
    tracker,
  }).middleware;
  const redactors = createSecretRedactors(protocolPayload);

  // Object.assign rather than a cast so the store's inferred type (dispatch
  // thunk overloads included) survives alongside the added functions.
  return Object.assign(
    configureStore({
      reducer: rootReducer,
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
          serializableCheck: {
            ignoredActions: ['dialogs/addDialog', 'dialogs/open/pending'],
          },
        }).concat(
          ...(options.isDevelopment ? [createLoggerMiddleware(redactors)] : []),
          writesInFlightMiddleware,
          syncMiddleware,
          localeChangeMiddleware,
          analyticsMiddleware,
          ...(options.extraMiddleware ?? []),
        ),
      preloadedState: {
        session: omit(sessionPayload, ['localeOptions']),
        protocol: protocolPayload,
      },
      // Redux Toolkit turns DevTools on unless told otherwise, which would
      // show a production interview's passphrase to anyone running the
      // extension.
      devTools: options.isDevelopment
        ? {
            actionSanitizer: redactors.redactAction,
            stateSanitizer: redactors.redactState,
          }
        : false,
    }),
    { flushSync, writesSettled, trackWrite },
  );
};

export type RootState = ReturnType<typeof rootReducer>;
export type AppDispatch = ReturnType<typeof store>['dispatch'];
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
