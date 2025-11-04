import { motion } from "motion/react";

type InsertButtonProps = {
	onClick: () => void;
};

const InsertButton = ({ onClick }: InsertButtonProps) => (
	<motion.div
		className="grid grid-cols-[1fr_auto_1fr] items-center gap-10 cursor-pointer group w-2xl p-4"
		onClick={onClick}
		initial={{ opacity: 0 }}
		animate={{ opacity: 1 }}
		transition={{
			delay: 1,
		}}
	>
		<div />
		<div className="w-10 h-10 rounded-full bg-timeline flex items-center justify-center text-primary-foreground text-4xl font-medium scale-40 group-hover:scale-110 group-hover:bg-action transition-all duration-300 ease-in-out">
			<span className="opacity-0 group-hover:opacity-100 transition-opacity duration-300">+</span>
		</div>
		<span className="justify-self-start opacity-0 group-hover:opacity-100 group-hover:font-bold transition-all font-semibold text-lg">
			Add stage here
		</span>
	</motion.div>
);

export default InsertButton;
