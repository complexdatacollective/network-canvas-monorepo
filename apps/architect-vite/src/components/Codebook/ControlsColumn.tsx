import Button from "@codaco/legacy-ui/components/Button";
import { DeleteIcon } from "lucide-react";

type ControlsColumnProps = {
	id: string;
	inUse: boolean;
	onDelete: (id: string) => void;
};

const ControlsColumn = ({ id, inUse, onDelete }: ControlsColumnProps) => (
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


export default ControlsColumn;
