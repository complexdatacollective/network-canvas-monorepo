import {
  createListenerMiddleware,
  type ListenerEffectAPI,
  type TypedStartListening,
  type UnknownAction,
} from '@reduxjs/toolkit';
import { v4 as uuid } from 'uuid';
import { navigate } from 'wouter/use-browser-location';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import { ensureError } from '@codaco/shared-consts';
import { getCanonicalProtocol, getTimelineLocus } from '~/selectors/protocol';
import { disarmInMemoryUnloadGuard } from '~/utils/beforeUnloadGuard';
import { beginProtocolCommit } from '~/utils/criticalOperation';
import { enqueueProtocolValidationDialogEvent } from '~/utils/protocolValidationDialogQueue';

import {
  clearActiveProtocol,
  setActiveProtocol,
  updateLastModified,
} from '../modules/activeProtocol';
import {
  getActiveProtocolId,
  getProtocolOwnedHere,
  getStorageUnavailable,
  setActiveProtocolId,
  setProtocolLockState,
} from '../modules/app';
import {
  clearValidation,
  validateProtocolAsync,
} from '../modules/protocolValidation';
import type { RootState } from '../modules/root';
import { resetDraft } from '../modules/stageEditorDraft';
import { protocolCommitAccepted } from '../protocolCommit';
import type { AppDispatch } from '../store';
import { timelineActions } from './timeline';

export const protocolValidationListenerMiddleware = createListenerMiddleware();

type AppStartListening = TypedStartListening<RootState, AppDispatch>;
type AppListenerApi = ListenerEffectAPI<RootState, AppDispatch>;
const startAppListening =
  protocolValidationListenerMiddleware.startListening as AppStartListening;

type KnownValidState = {
  session: number;
  locusId: string;
};

type ProtocolCommitCandidate = {
  session: number;
  protocolId: string | null;
  locusId: string;
  protocol: CurrentProtocol;
  persistenceAllowed: boolean;
};

let activeSession = 0;
let lastValidState: KnownValidState | null = null;
let invalidDialogId: string | null = null;
let latestInvalidSession: number | null = null;
let validationQueue: Promise<void> = Promise.resolve();

const isLocusInCurrentTimeline = (state: RootState, locusId: string): boolean =>
  state.activeProtocol.timeline.some((entry) => entry.id === locusId);

const closeInvalidDialog = (): void => {
  if (!invalidDialogId) return;
  enqueueProtocolValidationDialogEvent({
    type: 'close',
    id: invalidDialogId,
  });
  invalidDialogId = null;
  latestInvalidSession = null;
};

const beginTrustedSession = (state: RootState): void => {
  activeSession += 1;
  closeInvalidDialog();

  const protocol = getCanonicalProtocol(state);
  const locusId = getTimelineLocus(state);
  lastValidState =
    protocol && locusId
      ? {
          session: activeSession,
          locusId,
        }
      : null;
};

const clearProtocolSession = (): void => {
  activeSession += 1;
  lastValidState = null;
  closeInvalidDialog();
};

const resetInvalidProtocolSession = (listenerApi: AppListenerApi): void => {
  clearProtocolSession();
  disarmInMemoryUnloadGuard();
  listenerApi.dispatch(resetDraft(null));
  listenerApi.dispatch(clearValidation());
  listenerApi.dispatch(setProtocolLockState('owned'));
  listenerApi.dispatch(setActiveProtocolId(null));
  listenerApi.dispatch(clearActiveProtocol());
  // clearActiveProtocol changes `present`, while reset removes every past and
  // future copy so browser history can never revive the invalid candidate.
  listenerApi.dispatch(timelineActions.reset(null));
};

const openInvalidDialog = (
  listenerApi: AppListenerApi,
  candidate: ProtocolCommitCandidate,
  errorMessage: string,
): void => {
  latestInvalidSession = candidate.session;
  if (invalidDialogId) return;

  const dialogId = uuid();
  invalidDialogId = dialogId;
  enqueueProtocolValidationDialogEvent({
    type: 'open',
    id: dialogId,
    errorMessage,
    onRevert: () => {
      if (
        invalidDialogId !== dialogId ||
        latestInvalidSession !== activeSession ||
        !lastValidState ||
        lastValidState.session !== activeSession
      ) {
        return;
      }

      invalidDialogId = null;
      latestInvalidSession = null;
      listenerApi.dispatch(timelineActions.jump(lastValidState.locusId));
      navigate('/protocol');
    },
    onReturnToStart: () => {
      if (invalidDialogId !== dialogId) return;
      invalidDialogId = null;
      latestInvalidSession = null;
      resetInvalidProtocolSession(listenerApi);
    },
    onClose: () => {
      if (invalidDialogId === dialogId) {
        invalidDialogId = null;
        latestInvalidSession = null;
      }
    },
  });
};

const processCandidate = async (
  listenerApi: AppListenerApi,
  candidate: ProtocolCommitCandidate,
): Promise<void> => {
  try {
    const validationResult = await listenerApi
      .dispatch(validateProtocolAsync(candidate.protocol))
      .unwrap();
    if (!validationResult.result.success) {
      const state = listenerApi.getState();
      if (
        candidate.session === activeSession &&
        getTimelineLocus(state) === candidate.locusId
      ) {
        openInvalidDialog(
          listenerApi,
          candidate,
          ensureError(validationResult.result.error).message,
        );
      }
      return;
    }

    const state = listenerApi.getState();
    const belongsToActiveSession = candidate.session === activeSession;
    // An undo can move a still-validating candidate into the future. It is no
    // longer an accepted commit on the active branch and must not overwrite the
    // canonical row before the undo itself is validated.
    if (
      belongsToActiveSession &&
      !isLocusInCurrentTimeline(state, candidate.locusId)
    ) {
      return;
    }

    const timestamp = new Date().toISOString();
    const acceptedProtocol = {
      ...candidate.protocol,
      lastModified: timestamp,
    };

    if (belongsToActiveSession) {
      lastValidState = {
        session: candidate.session,
        locusId: candidate.locusId,
      };

      if (getTimelineLocus(state) === candidate.locusId) {
        closeInvalidDialog();
        listenerApi.dispatch({
          ...updateLastModified(timestamp),
          meta: { skipTimeline: true },
        });
      }
    }

    if (candidate.protocolId) {
      listenerApi.dispatch(
        protocolCommitAccepted({
          id: candidate.protocolId,
          protocol: acceptedProtocol,
          persistenceAllowed: candidate.persistenceAllowed,
        }),
      );
    }
  } catch (error: unknown) {
    const state = listenerApi.getState();
    if (
      candidate.session === activeSession &&
      getTimelineLocus(state) === candidate.locusId
    ) {
      openInvalidDialog(
        listenerApi,
        candidate,
        `Protocol validation could not be completed: ${
          typeof error === 'string' ? error : ensureError(error).message
        }`,
      );
    }
  }
};

// `setActiveProtocol` is trusted admission. Recent/rehydrated protocols come
// from canonical IndexedDB, and every import/template path validates before it
// dispatches this action. Seed the opening state as the revert baseline without
// validating or rewriting it.
startAppListening({
  actionCreator: setActiveProtocol,
  effect: (_action, listenerApi) => {
    beginTrustedSession(listenerApi.getState());
  },
});

startAppListening({
  actionCreator: clearActiveProtocol,
  effect: () => {
    clearProtocolSession();
  },
});

// Capture every timeline commit as its own immutable FIFO candidate. Validation
// and persistence never re-read a later protocol snapshot after an await.
startAppListening({
  predicate: (
    action: UnknownAction,
    currentState: RootState,
    previousState: RootState,
  ) => {
    if (
      setActiveProtocol.match(action) ||
      clearActiveProtocol.match(action) ||
      updateLastModified.match(action)
    ) {
      return false;
    }

    // Canonical, never the stage editor's draft overlay: a codebook edit made
    // inside an open editor must not be validated or persisted until the stage
    // is committed (#1382).
    const currentProtocol = getCanonicalProtocol(currentState);
    return (
      currentProtocol !== null &&
      currentProtocol !== getCanonicalProtocol(previousState) &&
      getTimelineLocus(currentState) !== null
    );
  },
  effect: async (_action, listenerApi) => {
    const state = listenerApi.getState();
    const protocol = getCanonicalProtocol(state);
    const locusId = getTimelineLocus(state);
    if (!protocol || !locusId) return;

    const finishCriticalOperation = beginProtocolCommit();
    const candidate: ProtocolCommitCandidate = {
      session: activeSession,
      protocolId: getActiveProtocolId(state),
      locusId,
      protocol,
      persistenceAllowed:
        !getStorageUnavailable(state) && getProtocolOwnedHere(state),
    };

    const run = validationQueue.then(() =>
      processCandidate(listenerApi, candidate),
    );
    validationQueue = run.catch(() => undefined);
    try {
      await run;
    } finally {
      finishCriticalOperation();
    }
  },
});
