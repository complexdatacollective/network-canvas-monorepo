import { createListenerMiddleware, type TypedStartListening } from "@reduxjs/toolkit";
import { getProtocol } from "~/selectors/protocol";
import { ensureError } from "~/utils/ensureError";
import { undo } from "../modules/activeProtocol";
import { buildCleanProtocol } from "../modules/protocol/utils/buildCleanProtocol";
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
	predicate: (_action, currentState, previousState) => {
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

		// Clean the protocol before validation (removes app state props)
		const cleanProtocol = buildCleanProtocol(protocol);
		const result = await listenerApi.dispatch(validateProtocolAsync(cleanProtocol)).unwrap();

		// Show dialog if validation failed
		if (!result.result.success) {
			const errorMessage = ensureError(result.result.error).message;
			listenerApi.dispatch(
				invalidProtocolDialog(errorMessage, () => {
					listenerApi.dispatch(undo());
				}),
			);
		}
	},
});
