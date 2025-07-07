import { has, omit } from "es-toolkit/compat";
import { useCallback, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { getFormValues, isDirty as isFormDirty, isInvalid as isFormInvalid } from "redux-form";
import { useLocation } from "wouter";
import Editor from "~/components/Editor";
import { actionCreators as dialogActions } from "~/ducks/modules/dialogs";
import { actionCreators as stageActions } from "~/ducks/modules/protocol/stages";
import { useAppDispatch, type RootState } from "~/ducks/store";
import { Button } from "~/lib/legacy-ui/components";
import { getStage, getStageIndex } from "~/selectors/protocol";
import { formName } from "./configuration";
import { getInterface } from "./Interfaces";
import StageHeading from "./StageHeading";

interface StageEditorProps {
	id?: string | null;
	insertAtIndex?: number;
	onComplete?: () => void;
}

const StageEditor = (props: StageEditorProps) => {
	const { id = null, type, insertAtIndex, onComplete } = props;

	const dispatch = useAppDispatch();
	const [showCodeView, setShowCodeView] = useState(false);
	const [, setLocation] = useLocation();

	// Get stage metadata from Redux state
	const stage = useSelector((state: RootState) => getStage(state, id || ""));
	const stageIndex = useSelector((state: RootState) => getStageIndex(state, id || ""));
	const stagePath = stageIndex !== -1 ? `stages[${stageIndex}]` : null;
	const interfaceType = stage?.type || type || "Information";
	const template = getInterface(interfaceType).template || {};
	const initialValues = stage || { ...template, type: interfaceType };

	// Get form state
	const hasUnsavedChanges = useSelector((state: RootState) => isFormDirty(formName)(state));
	const formValues = useSelector((state: RootState) => getFormValues(formName)(state));
	const hasSkipLogic = has(formValues, "skipLogic.action");
	const dirty = useSelector((state: RootState) => isFormDirty(formName)(state));
	const invalid = useSelector((state: RootState) => isFormInvalid(formName)(state));

	// Handle form submission
	const onSubmit = useCallback(
		(stageData: any) => {
			const normalizedStage = omit(stageData, "_modified");

			if (id) {
				dispatch(stageActions.updateStage(id, normalizedStage));
			} else {
				dispatch(stageActions.createStage(normalizedStage, insertAtIndex));
			}

			setLocation("/protocol");
		},
		[id, insertAtIndex, onComplete, dispatch],
	);

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
				<Button key="save" onClick={onSubmit} iconPosition="right" icon="arrow-right">
					Finished Editing
				</Button>,
			);
		}

		return buttons;
	}, [hasUnsavedChanges, onSubmit, handleCancel]);

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

	const sections = useMemo(() => getInterface(interfaceType).sections, [interfaceType]);

	const renderSections = (sectionsList: any[], { submitFailed }: { submitFailed: boolean }) =>
		sectionsList.map((SectionComponent: React.ComponentType<any>, sectionIndex: number) => {
			const sectionKey = `${interfaceType}-${sectionIndex}`;
			return (
				<SectionComponent
					key={sectionKey}
					form={formName}
					stagePath={stagePath}
					hasSubmitFailed={submitFailed}
					interfaceType={interfaceType}
				/>
			);
		});

	return (
		<Editor
			initialValues={initialValues}
			onSubmit={onSubmit}
			dirty={dirty}
			invalid={invalid}
			hasSkipLogic={hasSkipLogic}
			stagePath={stagePath}
			interfaceType={interfaceType}
		>
			{({ submitFailed }: { submitFailed: boolean }) => (
				<>
					<StageHeading id={id} />
					<div className="flex flex-col gap-10 w-full mb-32">{renderSections(sections, { submitFailed })}</div>
					<div className="fixed bottom-0 left-0 right-0 p-4 bg-surface-accent z-panel">
						<div className="flex justify-between items-center max-w-6xl mx-auto">
							<div className="flex gap-2">{secondaryButtons}</div>
							<div className="flex gap-2">{actionButtons}</div>
						</div>
					</div>
				</>
			)}
		</Editor>
	);
};

export default StageEditor;
