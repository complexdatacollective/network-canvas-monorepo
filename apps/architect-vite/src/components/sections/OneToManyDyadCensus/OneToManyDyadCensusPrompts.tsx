import { compose } from "recompose";
import EditableList from "../../EditableList";
import withSubject from "../../enhancers/withSubject";
import withDisabledSubjectRequired from "../../enhancers/withDisabledSubjectRequired";
import PromptPreview from "./PromptPreview";
import PromptFields from "./PromptFields";

type OneToManyDyadCensusPromptsProps = {
	form: string;
	entity?: string;
	type?: string;
	disabled?: boolean;
};

const OneToManyDyadCensusPrompts = ({ form, entity, type, disabled }: OneToManyDyadCensusPromptsProps) => (
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
		form={form}
		disabled={disabled}
		editProps={{ entity, type }}
	/>
);

export { OneToManyDyadCensusPrompts };

export default compose(withSubject, withDisabledSubjectRequired)(OneToManyDyadCensusPrompts);
