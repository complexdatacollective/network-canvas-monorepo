import { motion } from "motion/react";
import type { ReactNode } from "react";
import { cx } from "~/utils/cva";

type PanelProps = {
	type?: string | null;
	isComplete?: boolean;
	isActive?: boolean;
	children?: ReactNode;
};

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
	const animate = getAnimation({ isActive, isComplete });

	return (
		<motion.div
			initial={{ x: 0 }}
			animate={animate}
			transition={{ duration: 0.2, type: "tween" }}
			data-type={type ?? undefined}
			className={cx("absolute top-0 left-0 flex h-72 w-full flex-row shrink-0 basis-full")}
		>
			{children}
		</motion.div>
	);
};

export default Panel;
