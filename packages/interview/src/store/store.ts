'use client';

import {
  combineReducers,
  configureStore,
  type Middleware,
} from '@reduxjs/toolkit';
import { useDispatch } from 'react-redux';

import { NULL_TRACKER, type Tracker } from '../analytics/tracker';
import type { InterviewPayload, SyncHandler } from '../contract/types';
import { createAnalyticsListenerMiddleware } from './middleware/analyticsListener';
import logger from './middleware/logger';
import { createSyncMiddleware } from './middleware/syncMiddleware';
import protocol from './modules/protocol';
import session from './modules/session';
import ui from './modules/ui';

const rootReducer = combineReducers({
  session,
  protocol,
  ui,
});

type StoreOptions = {
  onSync: SyncHandler;
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
  const tracker = options.tracker ?? NULL_TRACKER;
  const analyticsMiddleware = createAnalyticsListenerMiddleware({
    tracker,
  }).middleware;

  // Object.assign rather than a cast so the store's inferred type (dispatch
  // thunk overloads included) survives alongside the added flushSync.
  return Object.assign(
    configureStore({
      reducer: rootReducer,
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
          serializableCheck: {
            ignoredActions: ['dialogs/addDialog', 'dialogs/open/pending'],
          },
        }).concat(
          ...(options.isDevelopment ? [logger] : []),
          syncMiddleware,
          analyticsMiddleware,
          ...(options.extraMiddleware ?? []),
        ),
      preloadedState: {
        session: sessionPayload,
        protocol: protocolPayload,
      },
    }),
    { flushSync: flush },
  );
};

export type RootState = ReturnType<typeof rootReducer>;
export type AppDispatch = ReturnType<typeof store>['dispatch'];
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
