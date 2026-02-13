import { Icon } from "@codaco/ui";
import { motion } from "framer-motion";

const CloseButton = (props) => (
	<motion.div
		id="close-button"
		whileHover={{ scale: 1.1 }}
		whileTap={{ scale: 0.95 }}
		style={{ cursor: "pointer" }}
		{...props}
	>
		<Icon name="close" />
	</motion.div>
);

export default CloseButton;
