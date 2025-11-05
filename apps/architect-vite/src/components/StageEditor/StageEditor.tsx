import type { Stage } from "@codaco/protocol-validation";
import { omit } from "es-toolkit/compat";
import { Redo, Undo } from "lucide-react";
import { useCallback, useMemo } from "react";
import { useSelector } from "react-redux";
import { isDirty as isFormDirty } from "redux-form";
import { useLocation } from "wouter";
import Editor from "~/components/Editor";
import { useAppDispatch } from "~/ducks/hooks";
import { getCanRedo, getCanUndo, redo, undo } from "~/ducks/modules/activeProtocol";
import { actionCreators as dialogActions } from "~/ducks/modules/dialogs";
import { actionCreators as stageActions } from "~/ducks/modules/protocol/stages";
import type { RootState } from "~/ducks/store";
import { Button } from "~/lib/legacy-ui/components";
import { getStage, getStageIndex } from "~/selectors/protocol";
import { formName } from "./configuration";
import { getInterface } from "./Interfaces";
import StageHeading from "./StageHeading";

type StageEditorProps = {
	id?: string | null;
	insertAtIndex?: number;
	type?: string;
};

const StageEditor = (props: StageEditorProps) => {
	const { id = null, type, insertAtIndex } = props;

	const dispatch = useAppDispatch();
	const [, setLocation] = useLocation();

	const handleUndo = useCallback(() => {
		dispatch(undo());
	}, [dispatch]);

	const handleRedo = useCallback(() => {
		dispatch(redo());
	}, [dispatch]);

	const canUndo = useSelector((state: RootState) => getCanUndo(state));
	const canRedo = useSelector((state: RootState) => getCanRedo(state));

	// Get stage metadata from Redux state
	const stage = useSelector((state: RootState) => getStage(state, id || ""));
	const stageIndex = useSelector((state: RootState) => getStageIndex(state, id || ""));
	const stagePath = stageIndex !== -1 ? `stages[${stageIndex}]` : null;
	const interfaceType = stage?.type || type || "Information";
	const template = getInterface(interfaceType).template || {};
	const initialValues = stage || { ...template, type: interfaceType };

	// Get form state
	const hasUnsavedChanges = useSelector((state: RootState) => isFormDirty(formName)(state));

	// Handle form submission
	const onSubmit = useCallback(
		(stageData: Record<string, unknown>) => {
			const normalizedStage = omit(stageData, "_modified") as Stage;

			if (id) {
				dispatch(stageActions.updateStage(id, normalizedStage));
			} else {
				dispatch(stageActions.createStage({ options: normalizedStage, index: insertAtIndex }));
			}

			setLocation("/protocol");
		},
		[id, insertAtIndex, setLocation, dispatch],
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
	const sections = useMemo(() => getInterface(interfaceType).sections, [interfaceType]);

	const renderSections = (sectionsList: unknown[]) =>
		sectionsList.map((SectionComponent: React.ComponentType<unknown>, sectionIndex: number) => {
			const sectionKey = `${interfaceType}-${sectionIndex}`;
			return <SectionComponent key={sectionKey} form={formName} stagePath={stagePath} interfaceType={interfaceType} />;
		});

	return (
		<Editor initialValues={initialValues} onSubmit={onSubmit} form={formName}>
			<StageHeading id={stage?.id} />
			<div className="flex flex-col gap-10 w-full mb-32">{renderSections(sections)}</div>
			<div className="fixed bottom-0 left-0 right-0 p-4 bg-surface-accent z-panel">
				<div className="flex justify-between items-center max-w-6xl mx-auto">
					<div className="flex gap-2">
						<Button key="cancel" onClick={handleCancel} color="platinum" iconPosition="right">
							Cancel
						</Button>
					</div>

					<div className="flex gap-2">
						<Button key="undo-button" color="platinum" icon={<Undo />} onClick={handleUndo} disabled={!canUndo}>
							Undo
						</Button>
						<Button key="redo-button" color="platinum" icon={<Redo />} onClick={handleRedo} disabled={!canRedo}>
							Redo
						</Button>
						{hasUnsavedChanges && (
							<Button type="submit" color="sea-green" iconPosition="right" icon="arrow-right">
								Finished Editing
							</Button>
						)}
					</div>
				</div>
			</div>
		</Editor>
	);
};

export default StageEditor;
