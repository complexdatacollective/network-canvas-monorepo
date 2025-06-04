import { compose } from "recompose";
import EditableList from "../../EditableList";
import withSubject from "../../enhancers/withSubject";
import withDisabledSubjectRequired from "../../enhancers/withDisabledSubjectRequired";
import { itemSelector } from "./helpers";
import PromptPreview from "./PromptPreview";
import PromptFields from "./PromptFields";
import withPromptChangeHandler from "./withPromptChangeHandler";

type TieStrengthCensusPromptsProps = {
	handleChangePrompt: (prompts: any[]) => void;
} & Record<string, any>;

const TieStrengthCensusPrompts = ({ handleChangePrompt, ...props }: TieStrengthCensusPromptsProps) => (
	<EditableList
		sectionTitle="Prompts"
		sectionSummary={
			<p>
				Add one or more prompts below to frame the task for the user. You can reorder the prompts using the draggable
				handles on the left hand side.
			</p>
		}
		previewComponent={PromptPreview}
		editComponent={PromptFields}
		title="Edit Prompt"
		fieldName="prompts"
		itemSelector={itemSelector()}
		onChange={handleChangePrompt}
		// eslint-disable-next-line react/jsx-props-no-spreading
		{...props}
	/>
);


export { TieStrengthCensusPrompts };

export default compose(withSubject, withDisabledSubjectRequired, withPromptChangeHandler)(TieStrengthCensusPrompts);
