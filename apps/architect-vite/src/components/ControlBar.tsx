import { AnimatePresence, motion } from "motion/react";
import type React from "react";
import { cn } from "~/utils/cn";

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

const animatedButton = (button: React.ReactNode, index: number) => {
	const key = typeof button === "object" && button !== null && "key" in button ? String(button.key) : String(index);
	return (
		<motion.div key={key} variants={buttonVariants} exit="hidden" layout>
			{button}
		</motion.div>
	);
};

type ControlBarProps = {
	buttons?: React.ReactNode[] | null;
	secondaryButtons?: React.ReactNode[] | null;
	className?: string;
};

const ControlBar = ({ buttons = null, secondaryButtons = null, className }: ControlBarProps) => {
	const buttonLayout = [
		<motion.div className="flex gap-4" key="secondary">
			{secondaryButtons && Array.from(secondaryButtons).map(animatedButton)}
		</motion.div>,
		<motion.div className="flex gap-4 ml-auto" key="primary">
			{buttons && Array.from(buttons).map(animatedButton)}
		</motion.div>,
	];

	return (
		<motion.div
			className={cn("text-primary-foreground bg-primary w-full flex justify-between items-center py-4 px-6", className)}
			variants={barVariants}
		>
			<AnimatePresence>{buttonLayout}</AnimatePresence>
		</motion.div>
	);
};

export default ControlBar;
