import { useCallback, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { isDirty, isInvalid, isSubmitting, startSubmit, submit } from "redux-form";
import { useLocation, useParams } from "wouter";
import TypeEditor, { formName } from "~/components/TypeEditor";
import { actionCreators as dialogActions } from "~/ducks/modules/dialogs";
import type { RootState } from "~/ducks/store";
import useProtocolLoader from "~/hooks/useProtocolLoader";
import { Button } from "~/lib/legacy-ui/components";

const TypeEditorPage = () => {
	const { entity, type } = useParams();

	// Handle "new" type creation
	const actualType = type === "new" ? undefined : type;
	const [, setLocation] = useLocation();
	const dispatch = useDispatch();

	// Load the protocol based on URL parameters
	useProtocolLoader();

	// Selectors
	const hasUnsavedChanges = useSelector((state: RootState) => isDirty(formName)(state));
	const submitting = useSelector((state: RootState) => isSubmitting(formName)(state));
	const invalid = useSelector((state: RootState) => isInvalid(formName)(state));

	// Navigation handler
	const handleGoBack = useCallback(() => {
		setLocation("/protocol/codebook");
	}, [setLocation]);

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
			handleGoBack();
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
					handleGoBack();
				},
			}) as any,
		);
		return false;
	}, [hasUnsavedChanges, handleGoBack, dispatch]);

	// Type editor completion handler
	const handleTypeEditorComplete = useCallback(() => {
		handleGoBack();
	}, [handleGoBack]);

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
					{actualType ? "Update Type" : "Create Type"}
				</Button>,
			);
		}

		return buttons;
	}, [hasUnsavedChanges, handleSubmit, handleCancel, submitting, invalid, actualType]);

	return (
		<div className="scene scene--type-editor">
			{/* Type Editor */}
			<TypeEditor entity={entity} type={actualType} onComplete={handleTypeEditorComplete} />

			{/* Control Bar */}
			<div className="fixed bottom-0 left-0 right-0 bg-cyber-grape p-4">
				<div className="flex justify-end items-center max-w-6xl mx-auto">
					<div className="flex gap-2">{actionButtons}</div>
				</div>
			</div>
		</div>
	);
};

export default TypeEditorPage;
