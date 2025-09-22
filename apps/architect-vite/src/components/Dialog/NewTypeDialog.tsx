import { useLocation } from "wouter";
import Dialog from "../NewComponents/Dialog";

type NewTypeDialogProps = {
	show?: boolean;
	entityType: "node" | "edge";
	onComplete?: () => void;
	onCancel?: () => void;
};

const NewTypeDialog = ({
	show = false,
	entityType,
	onComplete = () => {},
	onCancel = () => {},
}: NewTypeDialogProps) => {
	const [, setLocation] = useLocation();

	const handleCreateNewType = () => {
		onComplete();
		setLocation(`/protocol/codebook/${entityType}/new`);
	};

	return (
		<Dialog
			open={show}
			onOpenChange={(open) => !open && onCancel()}
			title={`Create New ${entityType === "node" ? "Node" : "Edge"} Type`}
			onCancel={onCancel}
			cancelText="Cancel"
			onConfirm={handleCreateNewType}
			confirmText={`Create New ${entityType === "node" ? "Node" : "Edge"} Type`}
		>
			<p>
				You are about to create a new {entityType} type. This will open the type editor where you can define the name,
				color, and variables for this {entityType} type.
			</p>
		</Dialog>
	);
};

export default NewTypeDialog;
