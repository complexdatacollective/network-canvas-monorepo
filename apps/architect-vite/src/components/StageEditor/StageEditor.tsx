import { useCallback, useEffect, useMemo, useState } from "react";
import { compose, defaultProps } from "recompose";
import Editor from "~/components/Editor";
import { Layout } from "~/components/EditorLayout";
import CodeView from "../CodeView";
import CollapsableHeader from "../Screen/CollapsableHeader";
import { formName } from "./configuration";
import { getInterface } from "./Interfaces";
import StageHeading, { CondensedStageHeading } from "./StageHeading";
import withStageEditorHandlers from "./withStageEditorHandlers";
import withStageEditorMeta from "./withStageEditorMeta";

interface StageEditorProps {
	id?: string | null;
	previewStage: () => void;
	interfaceType: string;
	stagePath?: any;
	hasSkipLogic?: boolean;
	[key: string]: any;
}

const StageEditor = (props: StageEditorProps) => {
	const { id = null, previewStage, interfaceType, stagePath = null, hasSkipLogic = false, ...rest } = props;

	const [showCodeView, setShowCodeView] = useState(false);

	const toggleCodeView = useCallback(() => {
		setShowCodeView((state) => !state);
	}, []);

	const handleKeyDown = useCallback((event) => {
		if (event.ctrlKey && event.key === "/") {
			toggleCodeView();
		}
	});

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

	console.log("StageEditor: passing rest", rest);

	const renderSections = (sectionsList, { submitFailed }) =>
		sectionsList.map((SectionComponent, sectionIndex) => {
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
		<Editor formName={formName} {...rest}>
			{({ submitFailed }) => (
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


export { formName, StageEditor };

export default compose(
	defaultProps({
		form: formName,
	}),
	withStageEditorMeta,
	withStageEditorHandlers,
)(StageEditor);
