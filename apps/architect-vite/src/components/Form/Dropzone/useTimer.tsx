import { useEffect, useRef } from "react";

const useTimer = (callback: () => void, delay: number, dependencies: unknown[]) => {
	const f = useRef(callback);

	useEffect(() => {
		const timer = setTimeout(() => f.current(), delay);

		return () => clearTimeout(timer);
	}, [...dependencies, delay]);
};

export default useTimer;
