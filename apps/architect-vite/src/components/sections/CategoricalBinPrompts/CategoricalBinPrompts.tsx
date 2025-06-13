import { compose } from "recompose";
import EditableList from "../../EditableList";
import withSubject from "../../enhancers/withSubject";
import withDisabledSubjectRequired from "../../enhancers/withDisabledSubjectRequired";
import { PromptPreview } from "../NameGeneratorPrompts";
import PromptFields from "./PromptFields";
import { itemSelector, normalizeField } from "./helpers";
import withPromptChangeHandler from "./withPromptChangeHandler";

type CategoricalBinPromptsProps = {
	handleChangePrompt: (value: any) => void;
	entity?: string;
	type?: string;
	form: string;
	disabled?: boolean;
};

const CategoricalBinPrompts = ({ handleChangePrompt, entity = null, type = null, form, disabled }: CategoricalBinPromptsProps) => (
	<EditableList
		previewComponent={PromptPreview}
		editComponent={PromptFields}
		title="Edit Prompt"
		onChange={handleChangePrompt}
		normalize={normalizeField}
		itemSelector={itemSelector(entity, type)}
		editProps={{ entity, type }}
		sectionTitle="Edit Prompts"
		sectionSummary={
			<p>
				Add one or more prompts below to frame the task for the user. You can reorder the prompts using the draggable
				handles on the left hand side.
			</p>
		}
		form={form}
		disabled={disabled}
	/>
);


export { CategoricalBinPrompts };

export default compose(withSubject, withDisabledSubjectRequired, withPromptChangeHandler)(CategoricalBinPrompts);
