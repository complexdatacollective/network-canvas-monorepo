import type { HTMLMotionProps } from "motion/react";
import { motion } from "motion/react";
import Icon from "./Icon";

interface CloseButtonProps extends HTMLMotionProps<"div"> {
	// Additional props can be added here if needed
}

const CloseButton = (props: CloseButtonProps) => (
	<motion.div
		id="close-button"
		whileHover={{ scale: 1.1 }}
		whileTap={{ scale: 0.95 }}
		style={{ cursor: "pointer" }}
		// eslint-disable-next-line react/jsx-props-no-spreading
		{...props}
	>
		<Icon name="close" />
	</motion.div>
);

export default CloseButton;
