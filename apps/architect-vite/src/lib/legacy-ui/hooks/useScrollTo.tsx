import { type RefObject, useEffect, useRef } from "react";
import scrollparent from "scrollparent";

const isElementVisible = (element: HTMLElement, container: HTMLElement): boolean => {
	const elementBounds = element.getBoundingClientRect();
	const containerBounds = container.getBoundingClientRect();
	const containerScrollPos = container.scrollTop;

	const containerViewport = {
		top: containerScrollPos,
		bottom: containerScrollPos + containerBounds.height,
	};

	return (
		elementBounds.top > 0 &&
		elementBounds.top < containerViewport.top &&
		elementBounds.top + elementBounds.height + containerScrollPos < containerViewport.bottom
	);
};

const scrollFocus = (destination: HTMLElement, delay = 0): NodeJS.Timeout | null => {
	if (!destination) {
		return null;
	}

	return setTimeout(() => {
		const scroller = scrollparent(destination) as HTMLElement;
		const scrollStart = scroller.scrollTop;
		const scrollerOffset = Number.parseInt(scroller.getBoundingClientRect().top.toString(), 10);
		const destinationOffset = Number.parseInt(destination.getBoundingClientRect().top.toString(), 10);

		const scrollEnd = destinationOffset + scrollStart - scrollerOffset;

		// If element is already visible, don't scroll
		if (isElementVisible(destination, scroller)) {
			return;
		}

		scroller.scrollTop = scrollEnd;
	}, delay);
};

/**
 * Automatically scroll to ref after conditions are met
 */
const useScrollTo = (
	ref: RefObject<HTMLElement>,
	condition: (...args: unknown[]) => boolean,
	watch: unknown[],
	delay = 0,
): void => {
	const timer = useRef<NodeJS.Timeout>();

	useEffect(() => {
		if (ref?.current && condition(...watch)) {
			clearTimeout(timer.current);
			timer.current = scrollFocus(ref.current, delay) ?? undefined;
		}
	}, watch);
};

export default useScrollTo;
