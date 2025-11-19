import { DeleteIcon } from "lucide-react";
import Button from "~/lib/legacy-ui/components/Button";

type ControlsColumnProps = {
	id: string;
	inUse: boolean;
	onDelete: (id: string) => void;
};

const ControlsColumn = ({ id, inUse, onDelete }: ControlsColumnProps) => (
	<>
		{!inUse && <Button color="neon-coral" icon={<DeleteIcon />} onClick={() => onDelete(id)} title="Delete variable" />}
	</>
);

export default ControlsColumn;
