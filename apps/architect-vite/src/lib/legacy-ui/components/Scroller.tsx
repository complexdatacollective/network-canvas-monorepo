import React, { useRef, useCallback, useImperativeHandle } from "react";
import { clamp } from "lodash";
import cx from "classnames";
import type { ReactNode } from "react";

interface ScrollerProps {
	className?: string;
	children: ReactNode;
	useSmoothScrolling?: boolean;
	onScroll?: (scrollTop: number, clampedScrollAmount: number, scrollAmount: number) => void;
}

interface ScrollerRef {
	scrollTo: (...args: Parameters<Element['scrollTo']>) => void;
}

const Scroller = React.forwardRef<ScrollerRef, ScrollerProps>(({ className = "", children, useSmoothScrolling = true, onScroll = () => {} }, ref) => {
	const scrollableRef = useRef();

	useImperativeHandle(ref, () => ({
		scrollTo: (...args) => scrollableRef.current.scrollTo(...args),
	}));

	const handleScroll = useCallback(() => {
		if (!scrollableRef.current) {
			return;
		}
		const element = scrollableRef.current;
		const { scrollTop } = element;
		const maxScrollPosition = element.scrollHeight - element.clientHeight;
		const scrollAmount = scrollTop / maxScrollPosition;

		// iOS inertial scrolling takes values out of range
		const clampedScrollAmount = clamp(scrollAmount, 0, 1);

		// eslint-disable-next-line react/destructuring-assignment
		onScroll(scrollTop, clampedScrollAmount, scrollAmount);
	}, [onScroll]);

	return (
		<div
			className={cx("scrollable", className)}
			onScroll={handleScroll}
			style={{ scrollBehavior: useSmoothScrolling ? "smooth" : "unset" }}
			ref={scrollableRef}
		>
			{children}
		</div>
	);
});


export default Scroller;
