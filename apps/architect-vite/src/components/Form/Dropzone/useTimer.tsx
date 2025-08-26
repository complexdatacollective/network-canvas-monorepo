import { useRef, useEffect } from "react";

const useTimer = (callback, delay, props) => {
	const f = useRef(callback);

	useEffect(() => {
		f.current = callback;
	}, [callback]);

	useEffect(() => {
		const timer = setTimeout(() => f.current(), delay);

		return () => clearTimeout(timer);
	}, [delay, ...props]);
};

export default useTimer;
