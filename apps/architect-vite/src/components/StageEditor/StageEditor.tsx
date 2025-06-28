import { has, omit } from "es-toolkit/compat";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { getFormValues, isDirty as isFormDirty, isInvalid as isFormInvalid } from "redux-form";
import Editor from "~/components/Editor";
import { Layout } from "~/components/EditorLayout";
import { actionCreators as stageActions } from "~/ducks/modules/protocol/stages";
import type { RootState } from "~/ducks/store";
import { getStage, getStageIndex } from "~/selectors/protocol";
import CodeView from "../CodeView";
import CollapsableHeader from "../CollapsableHeader";
import { formName } from "./configuration";
import { getInterface } from "./Interfaces";
import StageHeading, { CondensedStageHeading } from "./StageHeading";

interface StageEditorProps {
	id?: string | null;
	insertAtIndex?: number;
	onComplete?: () => void;
}

const StageEditor = (props: StageEditorProps) => {
	const { id = null, type, insertAtIndex, onComplete } = props;

	const dispatch = useDispatch();
	const [showCodeView, setShowCodeView] = useState(false);

	// Get stage metadata from Redux state
	const stage = useSelector((state: RootState) => getStage(state, id || ""));
	const stageIndex = useSelector((state: RootState) => getStageIndex(state, id || ""));
	const stagePath = stageIndex !== -1 ? `stages[${stageIndex}]` : null;
	const interfaceType = stage?.type || type || "Information";
	const template = getInterface(interfaceType).template || {};
	const initialValues = stage || { ...template, type: interfaceType };

	// Get form state
	const formValues = useSelector((state: RootState) => getFormValues(formName)(state));
	const hasSkipLogic = has(formValues, "skipLogic.action");
	const dirty = useSelector((state: RootState) => isFormDirty(formName)(state));
	const invalid = useSelector((state: RootState) => isFormInvalid(formName)(state));

	// Handle form submission
	const onSubmit = useCallback(
		(stageData: any) => {
			const normalizedStage = omit(stageData, "_modified");

			if (id) {
				// @ts-expect-error - thunk action returns promise
				return dispatch(stageActions.updateStage(id, normalizedStage)).then(() => onComplete?.());
			}

			// @ts-expect-error - thunk action returns promise
			return dispatch(stageActions.createStage(normalizedStage, insertAtIndex)).then(() => onComplete?.());
		},
		[id, insertAtIndex, onComplete, dispatch],
	);

	const toggleCodeView = useCallback(() => {
		setShowCodeView((state) => !state);
	}, []);

	const handleKeyDown = useCallback(
		(event: KeyboardEvent) => {
			if (event.ctrlKey && event.key === "/") {
				toggleCodeView();
			}
		},
		[toggleCodeView],
	);

	useEffect(() => {
		window.addEventListener("keydown", handleKeyDown);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [handleKeyDown]);

	useEffect(() => {
		// ipcRenderer.on("REFRESH_PREVIEW", previewStage);
		// return () => ipcRenderer.removeListener("REFRESH_PREVIEW", previewStage);
	}, []);

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
					<CodeView form={formName} show={showCodeView} toggleCodeView={toggleCodeView} />
					<CollapsableHeader threshold={165} collapsedState={<CondensedStageHeading id={id} />}>
						<StageHeading id={id} />
					</CollapsableHeader>
					<Layout>{renderSections(sections, { submitFailed })}</Layout>
				</>
			)}
		</Editor>
	);
};

export default StageEditor;
