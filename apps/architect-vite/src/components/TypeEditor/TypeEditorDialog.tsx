import { useCallback, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { isDirty, isInvalid, isSubmitting, startSubmit, submit } from "redux-form";
import Dialog from "~/components/Dialog/Dialog";
import TypeEditor, { formName } from "~/components/TypeEditor";
import { actionCreators as dialogActions } from "~/ducks/modules/dialogs";
import type { RootState } from "~/ducks/store";
import { Button } from "~/lib/legacy-ui/components";

type TypeEditorDialogProps = {
	entity?: string;
	type?: string;
	show: boolean;
	onCancel: () => void;
	onComplete?: () => void;
};

const TypeEditorDialog = ({ entity, type, show, onCancel, onComplete }: TypeEditorDialogProps) => {
	const dispatch = useDispatch();

	// Selectors
	const hasUnsavedChanges = useSelector((state: RootState) => isDirty(formName)(state));
	const submitting = useSelector((state: RootState) => isSubmitting(formName)(state));
	const invalid = useSelector((state: RootState) => isInvalid(formName)(state));

	// Form submission handler
	const handleSubmit = useCallback(() => {
		if (submitting) {
			return;
		}
		dispatch(startSubmit(formName));
		dispatch(submit(formName));
	}, [submitting, dispatch]);

	// Cancel handler with unsaved changes confirmation
	const handleCancel = useCallback((): boolean => {
		if (!hasUnsavedChanges) {
			onCancel();
			return true;
		}

		// Show confirmation dialog for unsaved changes
		dispatch(
			dialogActions.openDialog({
				type: "Warning",
				title: "Unsaved Changes",
				message: "You have unsaved changes. Are you sure you want to leave without saving?",
				confirmLabel: "Leave Without Saving",
				onConfirm: () => {
					onCancel();
				},
			}) as any,
		);
		return false;
	}, [hasUnsavedChanges, onCancel, dispatch]);

	// Type editor completion handler
	const handleTypeEditorComplete = useCallback(() => {
		onComplete?.();
	}, [onComplete]);

	// Memoized action buttons
	const actionButtons = useMemo(() => {
		const buttons = [];

		// Cancel button
		buttons.push(
			<Button key="cancel" onClick={handleCancel} color="platinum" iconPosition="right">
				Cancel
			</Button>,
		);

		// Save button (only if there are unsaved changes)
		if (hasUnsavedChanges) {
			buttons.push(
				<Button
					key="save"
					onClick={handleSubmit}
					iconPosition="right"
					icon="arrow-right"
					disabled={submitting || invalid}
				>
					{type ? "Update Type" : "Create Type"}
				</Button>,
			);
		}

		return buttons;
	}, [hasUnsavedChanges, handleSubmit, handleCancel, submitting, invalid, type]);

	return (
		<Dialog
			show={show}
			onClose={handleCancel}
			className="type-editor-dialog"
			footer={<div className="flex justify-end items-center gap-2">{actionButtons}</div>}
		>
			<TypeEditor entity={entity} type={type} onComplete={handleTypeEditorComplete} />
		</Dialog>
	);
};

export default TypeEditorDialog;
