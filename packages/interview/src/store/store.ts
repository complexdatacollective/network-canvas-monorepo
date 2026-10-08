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
import { createInterviewLogger } from './middleware/logger';
import { createSyncMiddleware } from './middleware/syncMiddleware';
import { createWritesInFlightMiddleware } from './middleware/writesInFlight';
import protocol from './modules/protocol';
import session from './modules/session';
import ui from './modules/ui';
import { createEncryptedValueRedaction } from './redactEncryptedValues';

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
  const {
    middleware: localeChangeMiddleware,
    settled: localeChangesSettled,
    markFinished,
  } = createLocaleChangeMiddleware({
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
  // locale, so this waits for the locale write as well as the session write.
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
  // The protocol, and so which variables are encrypted, never changes during
  // an interview.
  const redaction = createEncryptedValueRedaction(protocolPayload.codebook);

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
          ...(options.isDevelopment ? [createInterviewLogger(redaction)] : []),
          writesInFlightMiddleware,
          syncMiddleware,
          localeChangeMiddleware,
          analyticsMiddleware,
          ...(options.extraMiddleware ?? []),
        ),
      // Anyone with the extension could otherwise read an interview's state
      // and actions in a production build.
      devTools: options.isDevelopment
        ? {
            actionSanitizer: redaction.action,
            stateSanitizer: redaction.state,
          }
        : false,
      preloadedState: {
        session: omit(sessionPayload, ['localeOptions']),
        protocol: protocolPayload,
      },
    }),
    // `markFinished` is called once the host has recorded the finish.
    { flushSync, writesSettled, trackWrite, markFinished },
  );
};

export type RootState = ReturnType<typeof rootReducer>;
export type AppDispatch = ReturnType<typeof store>['dispatch'];
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
