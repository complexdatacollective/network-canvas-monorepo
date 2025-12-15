import { createListenerMiddleware, type TypedStartListening } from "@reduxjs/toolkit";
import { navigate } from "wouter/use-browser-location";
import { getProtocol } from "~/selectors/protocol";
import { ensureError } from "~/utils/ensureError";
import { undo, updateLastModified } from "../modules/activeProtocol";
import { validateProtocolAsync } from "../modules/protocolValidation";
import type { RootState } from "../modules/root";
import { invalidProtocolDialog } from "../modules/userActions/dialogs";
import type { AppDispatch } from "../store";

// Create the listener middleware
export const protocolValidationListenerMiddleware = createListenerMiddleware();

// Type the start listening function
type AppStartListening = TypedStartListening<RootState, AppDispatch>;
const startAppListening = protocolValidationListenerMiddleware.startListening as AppStartListening;

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

		// Only validate if:
		// 1. We have a current protocol
		// 2. The protocol has actually changed (deep comparison would be expensive, so we check reference)
		// 3. We're not already validating
		return (
			currentProtocol !== null && currentProtocol !== previousProtocol && !currentState.protocolValidation.isValidating
		);
	},
	effect: async (_action, listenerApi) => {
		const state = listenerApi.getState();
		const protocol = getProtocol(state);

		if (!protocol) {
			return;
		}

		const result = await listenerApi.dispatch(validateProtocolAsync(protocol)).unwrap();

		// Show dialog if validation failed
		if (!result.result.success) {
			const errorMessage = ensureError(result.result.error).message;
			listenerApi.dispatch(
				invalidProtocolDialog(errorMessage, () => {
					listenerApi.dispatch(undo());
					navigate("/protocol");
				}),
			);
		} else {
			// Update lastModified timestamp when validation succeeds
			listenerApi.dispatch(updateLastModified(new Date().toISOString()));
		}
	},
});
