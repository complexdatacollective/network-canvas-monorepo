import { motion } from "motion/react";
import type { ReactNode } from "react";

interface DropProps {
	children?: ReactNode;
}

const Drop = ({ children = null }: DropProps) => (
	<motion.div
		animate={{
			opacity: 1,
			y: "0",
		}}
		initial={{
			opacity: 0,
			y: "-5vh",
		}}
	>
		{children}
	</motion.div>
);


export default Drop;
