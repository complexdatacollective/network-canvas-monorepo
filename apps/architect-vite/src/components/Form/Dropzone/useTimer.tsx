import { useEffect, useRef } from "react";

const useTimer = (callback, delay, props) => {
	const f = useRef(callback);

	useEffect(() => {
		const timer = setTimeout(() => f.current(), delay);

		return () => clearTimeout(timer);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, props);
};

export default useTimer;
