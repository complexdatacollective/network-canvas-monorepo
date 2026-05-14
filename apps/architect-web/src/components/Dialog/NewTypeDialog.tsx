import { useEffect, useState } from "react";
import EntityTypeDialog from "../Codebook/EntityTypeDialog";

type NewTypeDialogProps = {
	show?: boolean;
	entityType: "node" | "edge";
	onComplete?: (newTypeId?: string) => void;
	onCancel?: () => void;
};

const NewTypeDialog = ({
	show = false,
	entityType,
	onComplete = () => {},
	onCancel: _onCancel = () => {},
}: NewTypeDialogProps) => {
	const [showEditor, setShowEditor] = useState(false);

	// Open editor when show becomes true
	useEffect(() => {
		if (show && !showEditor) {
			setShowEditor(true);
		}
	}, [show, showEditor]);

	const handleCloseEditor = (newTypeId?: string) => {
		setShowEditor(false);
		onComplete(newTypeId);
	};

	return <EntityTypeDialog show={showEditor} entity={entityType} onClose={handleCloseEditor} />;
};

export default NewTypeDialog;
