import { useEffect } from "react";
import { useLocation } from "wouter";

/**
 * Scrolls window to top whenever the route changes.
 * Similar to React Router's scroll restoration pattern.
 * @see https://reactrouter.com/web/guides/scroll-restoration/scroll-to-top
 */
export default function ScrollToTop() {
	const [pathname] = useLocation();

	useEffect(() => {
		window.scrollTo(0, 0);
	}, [pathname]);

	return null;
}
