import { useEffect } from "react";
import { useSelector } from "react-redux";
import { useLocation } from "wouter";
import { selectActiveProtocol } from "~/ducks/modules/activeProtocol";

/**
 * Hook to handle loading protocols based on route parameters
 * Reads protocolId from URL params and sets the active protocol
 */
export const useProtocolLoader = () => {
	const [, navigate] = useLocation();

	// Get the stored protocol
	const activeProtocol = useSelector(selectActiveProtocol);

	console.log("useProtocolLoader activeProtocol", activeProtocol);

	useEffect(() => {
		if (!activeProtocol) {
			// No protocol ID in URL, nothing to load
			navigate("/");
			return;
		}
		// navigate("/protocol");
	}, [activeProtocol, navigate]);
};

export default useProtocolLoader;
