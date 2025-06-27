import type React from "react";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

const variants = {
	collapsed: {
		opacity: 0,
		y: "-100%",
	},
	expanded: {
		opacity: 1,
		y: 0,
		transition: {
			stiffness: 300,
			damping: 30,
		},
	},
};

type CollapsableHeaderProps = {
	children: React.ReactNode;
	threshold?: number;
	collapsedState: React.ReactNode;
};

const CollapsableHeader = ({ children, threshold = 115, collapsedState }: CollapsableHeaderProps) => {
	const [isCollapsed, setIsCollapsed] = useState(false);
	const [scrollY, setScrollY] = useState(0);

	useEffect(() => {
		const handleScroll = () => {
			// Get the scroll position of the nearest scrollable parent or window
			const scrollElement = document.querySelector(".scene") || window;
			const currentScrollY = scrollElement === window ? window.scrollY : scrollElement.scrollTop;
			setScrollY(currentScrollY);
		};

		// Add scroll listener to window and potential parent scroll containers
		window.addEventListener("scroll", handleScroll);
		const sceneElement = document.querySelector(".scene");
		if (sceneElement) {
			sceneElement.addEventListener("scroll", handleScroll);
		}

		return () => {
			window.removeEventListener("scroll", handleScroll);
			if (sceneElement) {
				sceneElement.removeEventListener("scroll", handleScroll);
			}
		};
	}, []);

	useEffect(() => {
		if (scrollY > threshold) {
			setIsCollapsed(true);
		} else {
			setIsCollapsed(false);
		}
	}, [scrollY, threshold]);

	return (
		<>
			<motion.div key="expanded-state">{children}</motion.div>
			<AnimatePresence>
				{isCollapsed && (
					<motion.div
						key="collapsed-state"
						style={{
							position: "absolute",
							top: 0,
							width: "100%",
							zIndex: "var(--z-panel)",
						}}
						variants={variants}
						initial="collapsed"
						animate="expanded"
						exit="collapsed"
					>
						{collapsedState}
					</motion.div>
				)}
			</AnimatePresence>
		</>
	);
};

export default CollapsableHeader;
