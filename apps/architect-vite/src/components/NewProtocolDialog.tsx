import { useCallback, useState } from "react";
import { Row, Section } from "~/components/EditorLayout";
import Text from "~/components/Form/Fields/Text";
import Dialog from "~/components/NewComponents/Dialog";
import { Button } from "~/lib/legacy-ui/components";

type NewProtocolDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSubmit: (values: { name: string }) => void;
};

const NewProtocolDialog = ({ open, onOpenChange, onSubmit }: NewProtocolDialogProps) => {
	const [name, setName] = useState("");

	const handleConfirm = useCallback(() => {
		if (!name.trim()) return;
		onSubmit({ name: name.trim() });
		setName("");
	}, [name, onSubmit]);

	const handleCancel = useCallback(() => {
		setName("");
		onOpenChange(false);
	}, [onOpenChange]);

	const handleOpenChange = useCallback(
		(newOpen: boolean) => {
			if (!newOpen) {
				setName("");
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
			header={<h2 className="m-0">Create New Protocol</h2>}
			footer={
				<>
					<Button onClick={handleCancel} color="platinum">
						Cancel
					</Button>
					<Button onClick={handleConfirm} color="sea-green" disabled={!isValid}>
						Create Protocol
					</Button>
				</>
			}
			className="bg-surface-2"
		>
			<Section title="Protocol Name" layout="vertical">
				<Row>
					<Text
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
				</Row>
			</Section>
		</Dialog>
	);
};

export default NewProtocolDialog;
