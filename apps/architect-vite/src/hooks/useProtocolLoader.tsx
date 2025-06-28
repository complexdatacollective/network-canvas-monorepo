import { useEffect } from "react";
import { useSelector } from "react-redux";
import { useLocation, useParams } from "wouter";
import { selectActiveProtocol } from "~/ducks/modules/activeProtocol";

/**
 * Hook to handle loading protocols based on route parameters
 * Reads protocolId from URL params and sets the active protocol
 */
export const useProtocolLoader = () => {
	const params = useParams<{ protocolId: string }>();
	const [, navigate] = useLocation();

	const protocolId = params.protocolId;

	// Get the stored protocol
	const activeProtocol = useSelector(selectActiveProtocol);

	useEffect(() => {
		if (!protocolId) {
			// No protocol ID in URL, nothing to load
			return;
		}

		if (!activeProtocol) {
			// Protocol not found in store
			console.error(`Protocol with ID ${protocolId} not found`);
			// Could navigate to home or show error
			navigate("/");
			return;
		}

		navigate("/protocol");
	}, [protocolId, activeProtocol, navigate]);
};

export default useProtocolLoader;
