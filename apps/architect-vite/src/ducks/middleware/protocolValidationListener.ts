import { createListenerMiddleware, type TypedStartListening } from "@reduxjs/toolkit";
import { validateProtocolAsync } from "../modules/protocolValidation";
import { selectActiveProtocol } from "../modules/activeProtocol";
import type { RootState } from "../modules/root";
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
		const currentProtocol = selectActiveProtocol(currentState);
		const previousProtocol = selectActiveProtocol(previousState);

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
		const protocol = selectActiveProtocol(state);

		if (protocol) {
			// Dispatch the validation async thunk
			await listenerApi.dispatch(validateProtocolAsync(protocol));
		}
	},
});
