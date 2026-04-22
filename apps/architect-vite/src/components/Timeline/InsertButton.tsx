import { motion } from "motion/react";

type InsertButtonProps = {
	onClick: () => void;
};

const InsertButton = ({ onClick }: InsertButtonProps) => (
	<motion.button
		type="button"
		onClick={onClick}
		aria-label="Insert stage here"
		className="group flex size-6 cursor-pointer items-center justify-center rounded-full bg-white opacity-40 transition-opacity hover:opacity-100"
		style={{ boxShadow: "0 2px 8px rgba(22,21,43,0.08)" }}
	>
		<span className="text-base font-bold" style={{ color: "hsl(240 35% 17%)" }}>
			+
		</span>
	</motion.button>
);

export default InsertButton;
