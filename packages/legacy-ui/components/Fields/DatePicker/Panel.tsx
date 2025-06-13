import cx from "classnames";
import { motion } from "motion/react";
import { ReactNode } from "react";

interface PanelProps {
	type?: string | null;
	isComplete?: boolean;
	isActive?: boolean;
	children?: ReactNode;
}

const getAnimation = ({ isComplete, isActive }: { isComplete: boolean; isActive: boolean }) => {
	if (isComplete) {
		return { x: "-100%" };
	}
	if (isActive) {
		return { x: 0 };
	}
	return { x: "100%" };
};

const Panel = ({ type = null, isComplete = false, isActive = false, children = null }: PanelProps) => {
	const className = cx("date-picker__panel", {
		[`date-picker__panel--${type}`]: type,
		"date-picker__panel--is-complete": isComplete,
		"date-picker__panel--is-active": isActive,
	});

	const animate = getAnimation({ isActive, isComplete });

	return (
		<motion.div
			initial={{ x: 0 }}
			animate={animate}
			transition={{ duration: 0.2, type: "tween" }}
			className={className}
		>
			{children}
		</motion.div>
	);
};

export default Panel;