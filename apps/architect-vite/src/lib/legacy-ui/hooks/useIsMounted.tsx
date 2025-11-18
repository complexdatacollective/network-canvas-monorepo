/* eslint-disable no-return-assign */
/* eslint-disable no-void */
import { useCallback, useEffect, useRef } from "react";

const useIsMounted = (): (() => boolean) => {
	const isMountedRef = useRef(true);
	const isMounted = useCallback(() => isMountedRef.current, []);

	useEffect(() => () => void (isMountedRef.current = false), []);

	return isMounted;
};

export default useIsMounted;
