import { useCallback, useMemo } from "react";
import { useSelector } from "react-redux";
import { isDirty, isInvalid, isSubmitting, startSubmit, submit } from "redux-form";
import { useLocation, useParams } from "wouter";
import StageEditor from "~/components/StageEditor/StageEditor";
import { formName } from "~/components/StageEditor/configuration";
import { actionCreators as dialogActions } from "~/ducks/modules/dialogs";
import { useAppDispatch, type RootState } from "~/ducks/store";
import useProtocolLoader from "~/hooks/useProtocolLoader";
import { Button } from "~/lib/legacy-ui/components";
import { getLocus } from "~/selectors/timeline";

const StageEditorPage = () => {
	const { stageId } = useParams();
	const [, setLocation] = useLocation();
	const dispatch = useAppDispatch();

	// Load the protocol based on URL parameters
	useProtocolLoader();

	// Get insertAtIndex from URL search params if available (for new stages)
	const urlParams = new URLSearchParams(window.location.search);
	const insertAtIndex = urlParams.get("insertAtIndex") ? Number(urlParams.get("insertAtIndex")) : undefined;

	// Get current timeline locus from Redux state instead of URL
	const locus = useSelector(getLocus);

	// Selectors - simplified without timeline changes check for now
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
			setLocation("/protocol");
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
					setLocation("/protocol");
				},
			}),
		);
		return false;
	}, [hasUnsavedChanges, setLocation, dispatch]);

	// Stage editor completion handler
	const handleStageEditorComplete = useCallback(() => {
		setLocation("/protocol");
	}, [setLocation]);

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
				<Button key="save" onClick={handleSubmit} iconPosition="right" icon="arrow-right" disabled={submitting}>
					Finished Editing
				</Button>,
			);
		}

		return buttons;
	}, [hasUnsavedChanges, handleSubmit, handleCancel, submitting]);

	// Secondary buttons (like preview)
	const secondaryButtons = useMemo(
		() => [
			<Button
				key="preview"
				color="paradise-pink"
				disabled
				tooltip={
					invalid
						? [
								"Previewing this stage requires valid stage configuration. Fix the errors on this stage to enable previewing.",
							]
						: null
				}
			>
				Preview
			</Button>,
		],
		[invalid],
	);

	return (
		<div className="scene">
			{/* Stage Editor */}
			<StageEditor id={stageId} insertAtIndex={insertAtIndex} onComplete={handleStageEditorComplete} />

			{/* Control Bar */}
			<div className="fixed bottom-0 left-0 right-0 bg-surface-accent p-4">
				<div className="flex justify-between items-center max-w-6xl mx-auto">
					<div className="flex gap-2">{secondaryButtons}</div>
					<div className="flex gap-2">{actionButtons}</div>
				</div>
			</div>
		</div>
	);
};

export default StageEditorPage;
