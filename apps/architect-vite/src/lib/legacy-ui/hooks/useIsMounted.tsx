import { useCallback, useEffect, useRef } from "react";

const useIsMounted = (): (() => boolean) => {
	const isMountedRef = useRef(true);
	const isMounted = useCallback(() => isMountedRef.current, []);

	useEffect(() => {
		return () => {
			isMountedRef.current = false;
		};
	}, []);

	return isMounted;
};

export default useIsMounted;
