import { useCallback, useState } from "react";
import Text from "~/components/Form/Fields/Text";
import TextArea from "~/components/Form/Fields/TextArea";
import Dialog from "~/components/NewComponents/Dialog";

type NewProtocolDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSubmit: (values: { name: string; description?: string }) => void;
};

const NewProtocolDialog = ({ open, onOpenChange, onSubmit }: NewProtocolDialogProps) => {
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");

	const handleConfirm = useCallback(() => {
		if (!name.trim()) return;
		onSubmit({ name: name.trim(), description: description.trim() || undefined });
		// Reset state after submit
		setName("");
		setDescription("");
	}, [name, description, onSubmit]);

	const handleCancel = useCallback(() => {
		// Reset state on cancel
		setName("");
		setDescription("");
		onOpenChange(false);
	}, [onOpenChange]);

	const handleOpenChange = useCallback(
		(newOpen: boolean) => {
			if (!newOpen) {
				// Reset state when closing
				setName("");
				setDescription("");
			}
			onOpenChange(newOpen);
		},
		[onOpenChange],
	);

	const isValid = name.trim().length > 0;

	return (
		<Dialog
			open={open}
			onOpenChange={handleOpenChange}
			title="Create New Protocol"
			onConfirm={isValid ? handleConfirm : undefined}
			onCancel={handleCancel}
			confirmText="Create Protocol"
			cancelText="Cancel"
		>
			<div className="flex flex-col gap-4">
				<Text
					label="Protocol Name"
					placeholder="Enter a name for your protocol..."
					input={{
						value: name,
						onChange: (e) => setName(e.target.value),
					}}
					meta={{
						error: !name.trim() ? "Protocol name is required" : undefined,
						invalid: !name.trim(),
						touched: name !== "",
					}}
				/>
				<TextArea
					label="Description (optional)"
					placeholder="Enter a description for your protocol..."
					input={{
						value: description,
						onChange: (e) => setDescription(e.target.value),
					}}
				/>
			</div>
		</Dialog>
	);
};

export default NewProtocolDialog;
