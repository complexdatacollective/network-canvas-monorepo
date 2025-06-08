import { Button } from "@codaco/legacy-ui/components";
import { useCallback, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { isDirty, isSubmitting, startSubmit, submit } from "redux-form";
import { actionCreators as timelineActions } from "~/ducks/middleware/timeline";
import { actionCreators as dialogActions } from "~/ducks/modules/dialogs";
import { hasChanges as timelineHasChanges } from "~/selectors/timeline";
import type { RootState } from "~/ducks/store";
import ControlBar from "../ControlBar";
import Screen from "./Screen";

interface EditorScreenProps {
	header?: React.ReactNode;
	editor: React.ComponentType<any>;
	locus?: string;
	onComplete: () => void;
	secondaryButtons?: React.ReactNode[] | null;
	form: string;
	// Explicit props for StageEditor
	id?: string;
	insertAtIndex?: number;
}

const EditorScreen = ({
	header = null,
	editor: EditorComponent,
	locus,
	onComplete,
	secondaryButtons = null,
	form,
	id,
	insertAtIndex,
}: EditorScreenProps) => {
	const dispatch = useDispatch();
	
	// Selectors
	const hasUnsavedChanges = useSelector((state: RootState) => 
		isDirty(form)(state) || timelineHasChanges(state, locus)
	);
	const submitting = useSelector((state: RootState) => isSubmitting(form)(state));

	// Handlers
	const handleSubmit = useCallback(() => {
		if (submitting) {
			return;
		}
		dispatch(startSubmit(form));
		dispatch(submit(form));
	}, [submitting, form, dispatch]);

	const handleCancel = useCallback((): boolean => {
		if (!hasUnsavedChanges) {
			// Jump to original locus and complete
			if (locus) {
				dispatch(timelineActions.jump(locus));
			}
			onComplete();
			return true;
		}

		// Show confirmation dialog for unsaved changes
		dispatch(dialogActions.openDialog({
			type: "Warning",
			confirmLabel: "OK",
			onConfirm: () => {
				if (locus) {
					dispatch(timelineActions.jump(locus));
				}
				onComplete();
			},
		}) as any);
		return false; // Don't close the screen, wait for user confirmation
	}, [hasUnsavedChanges, locus, onComplete, dispatch]);

	// Memoized buttons
	const buttons = useMemo(() => {
		const saveButton = (
			<Button 
				key="save" 
				onClick={handleSubmit} 
				iconPosition="right" 
				icon="arrow-right" 
				disabled={submitting}
			>
				Finished Editing
			</Button>
		);

		const cancelButton = (
			<Button 
				key="cancel" 
				onClick={handleCancel} 
				color="platinum" 
				iconPosition="right"
			>
				Cancel
			</Button>
		);

		return hasUnsavedChanges ? [cancelButton, saveButton] : [cancelButton];
	}, [hasUnsavedChanges, handleSubmit, handleCancel, submitting]);

	return (
		<Screen
			header={header}
			footer={<ControlBar buttons={buttons} secondaryButtons={secondaryButtons} />}
			beforeCloseHandler={handleCancel}
		>
			<EditorComponent id={id} insertAtIndex={insertAtIndex} onComplete={onComplete} />
		</Screen>
	);
};

export default EditorScreen;