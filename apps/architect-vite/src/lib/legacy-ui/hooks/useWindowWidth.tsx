import debounce from "lodash/debounce";
import { useEffect, useState } from "react";

const useWindowWidth = (): number => {
	const [width, setWidth] = useState(window.innerWidth);

	useEffect(() => {
		const handleResize = () => setWidth(window.innerWidth);
		const debouncedHandleResize = debounce(handleResize, 1000);
		window.addEventListener("resize", debouncedHandleResize);
		return () => {
			window.removeEventListener("resize", debouncedHandleResize);
		};
	}, []);

	return width;
};

export default useWindowWidth;
