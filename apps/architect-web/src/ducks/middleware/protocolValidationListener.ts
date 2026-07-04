import {
  createListenerMiddleware,
  type TypedStartListening,
} from '@reduxjs/toolkit';
import { navigate } from 'wouter/use-browser-location';

import { getProtocol, getTimelineLocus } from '~/selectors/protocol';
import { ensureError } from '~/utils/ensureError';

import { updateLastModified } from '../modules/activeProtocol';
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
// opening another so repeated failed validations don't stack dialogs.
let invalidDialogOpen = false;

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
    // made while a validation was in flight are never left unvalidated.
    do {
      revalidatePending = false;

      const state = listenerApi.getState();
      const protocol = getProtocol(state);

      if (!protocol) {
        return;
      }

      const result = await listenerApi
        .dispatch(validateProtocolAsync(protocol))
        .unwrap();

      if (result.result.success) {
        // Record this known-valid position as the auto-revert target.
        lastValidLocusId = getTimelineLocus(listenerApi.getState());

        // Update lastModified timestamp when validation succeeds
        listenerApi.dispatch({
          ...updateLastModified(new Date().toISOString()),
          meta: { skipTimeline: true },
        });
      } else if (!invalidDialogOpen) {
        const errorMessage = ensureError(result.result.error).message;
        // Capture the revert target now so a later edit can't move it.
        const revertLocusId = lastValidLocusId;
        invalidDialogOpen = true;
        void listenerApi
          .dispatch(
            invalidProtocolDialog(errorMessage, () => {
              if (revertLocusId) {
                listenerApi.dispatch(timelineActions.jump(revertLocusId));
              }
              navigate('/protocol');
            }),
          )
          .finally(() => {
            invalidDialogOpen = false;
          });
      }
    } while (revalidatePending);
  },
});
