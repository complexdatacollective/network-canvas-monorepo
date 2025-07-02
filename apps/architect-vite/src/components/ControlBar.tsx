import cx from "classnames";
import { AnimatePresence, motion } from "motion/react";
import type React from "react";

const barVariants = {
	visible: {
		y: 0,
		transition: {
			when: "beforeChildren",
			staggerChildren: 0.1,
			stiffness: 300,
			damping: 30,
		},
	},
	hidden: {
		y: "100%",
		transition: {
			when: "afterChildren",
		},
	},
};

const buttonVariants = {
	visible: { opacity: 1, y: 0 },
	hidden: { opacity: 0, y: 10 },
};

const animatedButton = (button: React.ReactNode, index: number) => (
	<motion.div key={(button as any)?.key || index} variants={buttonVariants} exit="hidden" layout>
		{button}
	</motion.div>
);

type ControlBarProps = {
	buttons?: React.ReactNode[] | null;
	secondaryButtons?: React.ReactNode[] | null;
	className?: string;
};

const ControlBar = ({ buttons = null, secondaryButtons = null, className = "" }: ControlBarProps) => {
	const buttonLayout = [
		<motion.div className="control-bar__secondary-buttons" key="secondary">
			{secondaryButtons && Array.from(secondaryButtons).map(animatedButton)}
		</motion.div>,
		<motion.div className="control-bar__primary-buttons" key="primary">
			{buttons && Array.from(buttons).map(animatedButton)}
		</motion.div>,
	];

	return (
		<motion.div
			className={cx("control-bar", "text-white bg-cyber-grape fixed bottom-0 z-20", className)}
			variants={barVariants}
		>
			<AnimatePresence>{buttonLayout}</AnimatePresence>
		</motion.div>
	);
};

export default ControlBar;
