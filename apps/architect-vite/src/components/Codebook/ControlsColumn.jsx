import Button from "@codaco/legacy-ui/components/Button";
import { DeleteIcon } from "lucide-react";
import PropTypes from "prop-types";

const ControlsColumn = ({ id, inUse, onDelete }) => (
	<>
		{!inUse && (
			<Button
				size="small"
				color="neon-coral"
				icon={<DeleteIcon />}
				onClick={() => onDelete(id)}
				title="Delete variable"
			/>
		)}
	</>
);

ControlsColumn.propTypes = {
	id: PropTypes.string.isRequired,
	onDelete: PropTypes.func.isRequired,
	inUse: PropTypes.bool.isRequired,
};

ControlsColumn.defaultProps = {};

export default ControlsColumn;
