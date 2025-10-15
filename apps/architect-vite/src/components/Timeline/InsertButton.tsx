import { motion } from "motion/react";

type InsertButtonProps = {
	onClick: () => void;
};

const InsertButton = ({ onClick }: InsertButtonProps) => (
	<motion.div
		className="timeline__insert"
		onClick={onClick}
		initial={{ opacity: 0 }}
		animate={{ opacity: 1 }}
		transition={{
			delay: 1,
		}}
	>
		Add stage here
	</motion.div>
);

export default InsertButton;
