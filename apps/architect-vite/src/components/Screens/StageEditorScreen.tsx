import { Button } from "@codaco/legacy-ui/components";
import { useCallback } from "react";
import { useSelector } from "react-redux";
import { isInvalid as isFormInvalid } from "redux-form";
import type { RootState } from "~/ducks/store";
import EditorScreen from "../Screen/EditorScreen";
import { formName } from "../StageEditor/configuration";
import StageEditor from "../StageEditor/StageEditor";

interface StageEditorScreenProps {
	id?: string;
	insertAtIndex?: number;
	onComplete: () => void;
	locus?: string;
}

const StageEditorScreen = ({ id, insertAtIndex, onComplete, locus }: StageEditorScreenProps) => {
	// Selectors
	const invalid = useSelector((state: RootState) => isFormInvalid(formName)(state));

	// Handlers
	const handleComplete = useCallback(() => {
		onComplete();
	}, [onComplete]);

	// Helper function for tooltip message
	const getInvalidStageMessage = (isInvalid: boolean): string[] =>
		isInvalid
			? ["Previewing this stage requires valid stage configuration. Fix the errors on this stage to enable previewing."]
			: [];

	// Secondary buttons
	const secondaryButtons = [
		<Button
			key="preview"
			color="paradise-pink"
			disabled={invalid}
			tooltip={invalid ? getInvalidStageMessage(invalid) : null}
		>
			Preview
		</Button>,
	];

	return (
		<EditorScreen
			editor={StageEditor}
			form={formName}
			locus={locus}
			onComplete={handleComplete}
			secondaryButtons={secondaryButtons}
			// Props passed to StageEditor
			id={id}
			insertAtIndex={insertAtIndex}
		/>
	);
};

export default StageEditorScreen;
