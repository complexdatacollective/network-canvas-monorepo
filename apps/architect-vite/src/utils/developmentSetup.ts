import developmentProtocol from "@codaco/development-protocol";
import type { Protocol } from "@codaco/protocol-validation";
import { addProtocol, generateProtocolId } from "~/ducks/modules/protocols";
import type { AppDispatch } from "~/ducks/store";

/**
 * Install development protocols for testing
 * This function adds sample protocols to the store
 */
export async function installDevelopmentProtocol(dispatch: AppDispatch) {
	try {
		// Add the development protocol
		const protocol = developmentProtocol as Protocol;
		const protocolId = await generateProtocolId(protocol);

		dispatch(
			addProtocol({
				id: protocolId,
				protocol,
				name: protocol.name,
				description: protocol.description,
			}),
		);

		console.log("Development protocol installed:", {
			developmentProtocol: protocolId,
		});
	} catch (error) {
		console.error("Error initializing development protocols:", error);
	}
}

/**
 * Clear all stored data (protocols, active protocol, etc.)
 * This function clears both Redux state and localStorage
 */
export function clearAllStorage(_dispatch: AppDispatch) {
	try {
		// Clear localStorage
		localStorage.clear();

		// Reload the page to reset Redux state
		window.location.reload();

		console.log("Storage cleared and app reloaded");
	} catch (error) {
		console.error("Error clearing storage:", error);
	}
}
