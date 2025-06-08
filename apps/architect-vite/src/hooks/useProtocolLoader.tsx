import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useLocation, useParams } from "wouter";
import { actionCreators as activeProtocolActions } from "~/ducks/modules/activeProtocol";
import { selectProtocolById } from "~/ducks/modules/protocols";
import type { RootState } from "~/ducks/modules/root";
import { getProtocol } from "~/selectors/protocol";

interface ProtocolLoaderResult {
	protocolId?: string;
	isLoading: boolean;
	error?: string;
}

/**
 * Hook to handle loading protocols based on route parameters
 * Reads protocolId from URL params and sets the active protocol
 */
export const useProtocolLoader = (): ProtocolLoaderResult => {
	const dispatch = useDispatch();
	const params = useParams();
	const [, navigate] = useLocation();

	const protocolId = params.protocolId as string | undefined;

	// Get the stored protocol
	const storedProtocol = useSelector((state: RootState) =>
		protocolId ? selectProtocolById(protocolId)(state) : undefined,
	);

	// Check if we already have the correct protocol active
	const currentProtocol = useSelector((state: RootState) => getProtocol(state));

	useEffect(() => {
		if (!protocolId) {
			// No protocol ID in URL, nothing to load
			return;
		}

		if (!storedProtocol) {
			// Protocol not found in store
			console.error(`Protocol with ID ${protocolId} not found`);
			// Could navigate to home or show error
			navigate("/");
			return;
		}

		// Check if we already have this protocol loaded (compare by name and content)
		if (
			currentProtocol &&
			currentProtocol.name === storedProtocol.protocol.name &&
			JSON.stringify(currentProtocol) === JSON.stringify(storedProtocol.protocol)
		) {
			// Already have this protocol active
			return;
		}

		// Set the active protocol
		dispatch(activeProtocolActions.setActiveProtocol(storedProtocol.protocol));
	}, [protocolId, storedProtocol, currentProtocol, dispatch, navigate]);
};

export default useProtocolLoader;
