import { Icon } from "@codaco/ui";
import { motion } from "framer-motion";
import PropTypes from "prop-types";
import React from "react";

const DeleteButton = ({ onDelete }) => (
	<motion.div whileHover={{ scale: 1.5, rotate: 180 }} className="list-delete-button" onClick={onDelete} title="Delete">
		<Icon name="delete" />
	</motion.div>
);

DeleteButton.propTypes = {
	onDelete: PropTypes.func.isRequired,
};

export default DeleteButton;
