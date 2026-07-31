import {
  createListenerMiddleware,
  type TypedStartListening,
} from '@reduxjs/toolkit';

import { assetDb } from '~/utils/assetDB';
import { reportAutosaveFailure } from '~/utils/autosaveFailureQueue';
import { beginProtocolCommit } from '~/utils/criticalOperation';
import { getStoredProtocol, putStoredProtocol } from '~/utils/protocolLibrary';

import type { RootState } from '../modules/root';
import { protocolCommitAccepted } from '../protocolCommit';
import type { AppDispatch } from '../store';

export const protocolLibraryListenerMiddleware = createListenerMiddleware();

type AppStartListening = TypedStartListening<RootState, AppDispatch>;
const startAppListening =
  protocolLibraryListenerMiddleware.startListening as AppStartListening;

// Whether the user has already been warned about the current persistence-failure
// streak. Reset on the next successful canonical write.
let autosaveErrorNotified = false;

// Preserve accepted commit order per protocol. Different protocol rows can
// write independently, but an older accepted snapshot must never overtake a
// newer one for the same row.
const writeLocks = new Map<string, Promise<void>>();

const persistAcceptedCommit = (
  snapshot: ReturnType<typeof protocolCommitAccepted>['payload'],
): void => {
  const finishCriticalOperation = beginProtocolCommit();
  const previous = writeLocks.get(snapshot.id) ?? Promise.resolve();
  const run = (async () => {
    await previous;
    try {
      // A commit can finish validation after its protocol was deleted. Keep the
      // existence check and put in one transaction so a queued write cannot
      // resurrect that row. `assets` is included because putStoredProtocol
      // garbage-collects orphaned blobs as part of the durable commit.
      await assetDb.transaction(
        'rw',
        assetDb.protocols,
        assetDb.assets,
        async () => {
          const existing = await getStoredProtocol(snapshot.id);
          if (!existing) return;

          await putStoredProtocol({
            id: snapshot.id,
            protocol: snapshot.protocol,
            name: snapshot.protocol.name,
            description: snapshot.protocol.description,
          });
        },
      );
      autosaveErrorNotified = false;
    } catch (error: unknown) {
      console.error('Protocol library commit failed', error);
      if (!autosaveErrorNotified) {
        autosaveErrorNotified = true;
        reportAutosaveFailure();
      }
    }
  })();

  writeLocks.set(snapshot.id, run);
  void run.finally(() => {
    finishCriticalOperation();
    if (writeLocks.get(snapshot.id) === run) {
      writeLocks.delete(snapshot.id);
    }
  });
};

// Canonical storage is downstream of validation: no timer and no independent
// protocol-diff observer. Invalid or unvalidated timeline states therefore
// cannot reach IndexedDB.
startAppListening({
  actionCreator: protocolCommitAccepted,
  effect: (action) => {
    if (!action.payload.persistenceAllowed) return;
    persistAcceptedCommit(action.payload);
  },
});
