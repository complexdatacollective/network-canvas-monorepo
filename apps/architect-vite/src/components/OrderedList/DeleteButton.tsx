import { Icon } from "@codaco/legacy-ui/components";
import { motion } from "motion/react";

type DeleteButtonProps = {
	onDelete: () => void;
};

const DeleteButton = ({ onDelete }: DeleteButtonProps) => (
	<motion.div whileHover={{ scale: 1.5, rotate: 180 }} className="list-delete-button" onClick={onDelete} title="Delete">
		<Icon name="delete" />
	</motion.div>
);

export default DeleteButton;
