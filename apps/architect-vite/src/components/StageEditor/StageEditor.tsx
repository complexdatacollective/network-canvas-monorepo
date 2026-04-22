import type { Stage, StageType } from "@codaco/protocol-validation";
import { omit } from "es-toolkit/compat";
import { useCallback, useEffect, useMemo } from "react";
import { useSelector } from "react-redux";
import { isDirty as isFormDirty, isValid as isFormValidSelector, submit as submitForm } from "redux-form";
import { useLocation } from "wouter";
import Card from "~/components/shared/Card";
import { useAppDispatch } from "~/ducks/hooks";
import { actionCreators as dialogActions } from "~/ducks/modules/dialogs";
import { actionCreators as stageActions } from "~/ducks/modules/protocol/stages";
import type { RootState } from "~/ducks/store";
import { getStage, getStageIndex } from "~/selectors/protocol";
import Editor from "../Editor";
import { formName } from "./configuration";
import { getInterface, type SectionComponent } from "./Interfaces";
import StageHeading from "./StageHeading";

type StageEditorProps = {
	id?: string | null;
	insertAtIndex?: number;
	type?: string;
	submitRequestId: number;
	cancelRequestId: number;
	onValidityChange?: (valid: boolean) => void;
};

const StageEditor = (props: StageEditorProps) => {
	const { id = null, type, insertAtIndex, submitRequestId, cancelRequestId, onValidityChange } = props;

	const dispatch = useAppDispatch();
	const [, setLocation] = useLocation();

	const stage = useSelector((state: RootState) => getStage(state, id || ""));
	const stageIndex = useSelector((state: RootState) => getStageIndex(state, id || ""));
	const stagePath = stageIndex !== -1 ? `stages[${stageIndex}]` : null;
	const interfaceType = (stage?.type || type || "Information") as StageType;
	const template = getInterface(interfaceType).template || {};
	const initialValues = stage || { ...template, type: interfaceType };

	const hasUnsavedChanges = useSelector((state: RootState) => isFormDirty(formName)(state));
	const isFormValid = useSelector((state: RootState) => isFormValidSelector(formName)(state));

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

	const handleCancel = useCallback((): boolean => {
		if (!hasUnsavedChanges) {
			setLocation("/protocol");
			return true;
		}

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

	useEffect(() => {
		onValidityChange?.(isFormValid);
	}, [isFormValid, onValidityChange]);

	useEffect(() => {
		if (submitRequestId === 0) return;
		dispatch(submitForm(formName));
	}, [submitRequestId, dispatch]);

	useEffect(() => {
		if (cancelRequestId === 0) return;
		handleCancel();
	}, [cancelRequestId, handleCancel]);

	return (
		<Editor initialValues={initialValues} onSubmit={onSubmit} form={formName}>
			<div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8">
				<StageHeading />
				{sections.map((SectionComponent: SectionComponent) => (
					<Card key={`${interfaceType}-${SectionComponent.displayName ?? SectionComponent.name}`}>
						<SectionComponent form={formName} stagePath={stagePath} interfaceType={interfaceType} />
					</Card>
				))}
			</div>
		</Editor>
	);
};

export default StageEditor;
