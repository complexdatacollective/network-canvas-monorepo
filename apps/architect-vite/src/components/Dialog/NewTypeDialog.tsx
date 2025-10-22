import { useEffect, useState } from "react";
import EntityTypeDialog from "../Codebook/EntityTypeDialog";

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
	const [showEditor, setShowEditor] = useState(false);

	// Open editor when show becomes true
	useEffect(() => {
		if (show && !showEditor) {
			setShowEditor(true);
		}
	}, [show, showEditor]);

	const handleCloseEditor = () => {
		setShowEditor(false);
		onComplete();
	};

	return <EntityTypeDialog show={showEditor} entity={entityType} onClose={handleCloseEditor} />;
};

export default NewTypeDialog;
