import {
  createListenerMiddleware,
  type TypedStartListening,
} from '@reduxjs/toolkit';
import { v4 as uuid } from 'uuid';
import { navigate } from 'wouter/use-browser-location';

import { getProtocol, getTimelineLocus } from '~/selectors/protocol';
import { ensureError } from '~/utils/ensureError';

import { updateLastModified } from '../modules/activeProtocol';
import { closeDialog } from '../modules/dialogs';
import { validateProtocolAsync } from '../modules/protocolValidation';
import type { RootState } from '../modules/root';
import { invalidProtocolDialog } from '../modules/userActions/dialogs';
import type { AppDispatch } from '../store';
import { timelineActions } from './timeline';

// Create the listener middleware
export const protocolValidationListenerMiddleware = createListenerMiddleware();

// Type the start listening function
type AppStartListening = TypedStartListening<RootState, AppDispatch>;
const startAppListening =
  protocolValidationListenerMiddleware.startListening as AppStartListening;

// Locus of the last state that validated successfully. The auto-revert targets
// this position so it undoes back to a known-valid point rather than blindly
// popping the newest timeline entry.
let lastValidLocusId: string | null = null;

// Edits that land while a validation is in flight are gated out of the effect
// (isValidating is true across the awaited run); record that so we re-validate
// the latest state once the current run finishes instead of dropping it.
let revalidatePending = false;

// The invalid-protocol dialog reverts on confirm; while one is open, suppress
// opening another so repeated failed validations don't stack dialogs. The id
// lets a later successful validation dismiss the now-stale dialog.
let invalidDialogId: string | null = null;

// Listen for any protocol changes and trigger validation
startAppListening({
  predicate: (action, currentState, previousState) => {
    // Skip validation for lastModified updates to prevent infinite loop
    if (updateLastModified.match(action)) {
      return false;
    }

    // Get the current and previous active protocols
    const currentProtocol = getProtocol(currentState);
    const previousProtocol = getProtocol(previousState);

    const changed =
      currentProtocol !== null && currentProtocol !== previousProtocol;

    // An edit arrived while a validation is in flight: remember to re-validate
    // the latest state after the current run rather than silently skipping it.
    if (changed && currentState.protocolValidation.isValidating) {
      revalidatePending = true;
    }

    // Only validate if we have a changed protocol and aren't mid-validation.
    return changed && !currentState.protocolValidation.isValidating;
  },
  effect: async (_action, listenerApi) => {
    // Re-validate the latest state until no edit arrived during a run, so edits
    // made while a validation was in flight are never left unvalidated. The
    // try/finally guarantees that a thrown/rejected validation still clears
    // isValidating (via the thunk) and re-checks revalidatePending, so an edit
    // that landed mid-run is never silently dropped.
    do {
      // Reset before awaiting so an edit that arrives during this run flips it
      // back to true and drives another iteration.
      revalidatePending = false;

      const state = listenerApi.getState();
      const protocol = getProtocol(state);

      if (!protocol) {
        return;
      }

      // Capture the locus of the state being validated before awaiting, so an
      // edit that lands during validation can't make us record the newer,
      // unvalidated position as known-valid.
      const validatedLocusId = getTimelineLocus(state);

      try {
        const result = await listenerApi
          .dispatch(validateProtocolAsync(protocol))
          .unwrap();

        if (result.result.success) {
          // Record this known-valid position as the auto-revert target.
          lastValidLocusId = validatedLocusId;

          // A previously-opened revert dialog is now stale: the latest state
          // validated cleanly, so dismiss it rather than let the user revert a
          // valid protocol back to an older point.
          if (invalidDialogId) {
            listenerApi.dispatch(closeDialog(invalidDialogId));
            invalidDialogId = null;
          }

          // Update lastModified timestamp when validation succeeds
          listenerApi.dispatch({
            ...updateLastModified(new Date().toISOString()),
            meta: { skipTimeline: true },
          });
        } else if (!invalidDialogId) {
          const errorMessage = ensureError(result.result.error).message;
          // Capture the revert target and the locus that failed now, so a later
          // edit can't move them.
          const revertLocusId = lastValidLocusId;
          const invalidLocusId = validatedLocusId;
          const dialogId = uuid();
          invalidDialogId = dialogId;
          void listenerApi
            .dispatch(
              invalidProtocolDialog(
                errorMessage,
                () => {
                  // Staleness check: only revert if the invalid state is still
                  // the current state. If a valid newer edit superseded it, the
                  // success branch will already have dismissed this dialog, but
                  // guard here too so a confirm can never discard valid work.
                  const currentLocusId = getTimelineLocus(
                    listenerApi.getState(),
                  );
                  if (currentLocusId !== invalidLocusId) {
                    return;
                  }
                  if (revertLocusId) {
                    listenerApi.dispatch(timelineActions.jump(revertLocusId));
                  }
                  navigate('/protocol');
                },
                dialogId,
              ),
            )
            .finally(() => {
              // Clear only if this dialog is still the tracked one; a later
              // success may have already dismissed it and opened nothing new.
              if (invalidDialogId === dialogId) {
                invalidDialogId = null;
              }
            });
        }
      } catch {
        // Validation threw (thunk rejected). isValidating is already cleared by
        // the rejected reducer; fall through to the while-check so a pending
        // edit is still re-validated instead of being dropped.
      }
    } while (revalidatePending);
  },
});
