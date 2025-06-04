import React, { useContext, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ScreenContext } from "./Screen";

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
	const { scrollY: currentOffset } = useContext(ScreenContext);
	const [isCollapsed, setIsCollapsed] = useState(false);

	useEffect(() => {
		if (currentOffset > threshold) {
			setIsCollapsed(true);
		} else {
			setIsCollapsed(false);
		}
	}, [currentOffset, threshold]);

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