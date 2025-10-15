import { useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { isDirty, isInvalid, isSubmitting, startSubmit, submit } from "redux-form";
import Dialog from "~/components/NewComponents/Dialog";
import TypeEditor, { formName } from "~/components/TypeEditor";
import { actionCreators as dialogActions } from "~/ducks/modules/dialogs";
import type { RootState } from "~/ducks/store";

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
	const _invalid = useSelector((state: RootState) => isInvalid(formName)(state));

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

	const dialogTitle = type ? "Edit Type" : "Create Type";

	return (
		<Dialog
			open={show}
			onOpenChange={(open) => !open && handleCancel()}
			title={dialogTitle}
			onCancel={handleCancel}
			cancelText="Cancel"
			onConfirm={hasUnsavedChanges ? handleSubmit : undefined}
			confirmText={hasUnsavedChanges ? (type ? "Update Type" : "Create Type") : undefined}
		>
			<TypeEditor entity={entity} type={type} onComplete={handleTypeEditorComplete} />
		</Dialog>
	);
};

export default TypeEditorDialog;
