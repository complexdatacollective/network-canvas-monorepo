import { useEffect } from "react";
import { useSelector } from "react-redux";
import { useLocation } from "wouter";
import { getProtocol } from "~/selectors/protocol";

/**
 * Hook to handle loading protocols based on route parameters
 * Reads protocolId from URL params and sets the active protocol
 */
const useProtocolLoader = () => {
	const [, _navigate] = useLocation();

	// Get the stored protocol
	const activeProtocol = useSelector(getProtocol);

	useEffect(() => {
		if (!activeProtocol) {
			// No protocol ID in URL, nothing to load
			// navigate("/");
			return;
		}
		// navigate("/protocol");
	}, [activeProtocol]);
};

export default useProtocolLoader;
