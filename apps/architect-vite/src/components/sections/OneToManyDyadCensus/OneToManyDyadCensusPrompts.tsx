import { compose } from "recompose";
import { Section } from "~/components/EditorLayout";
import EditableList from "../../EditableList";
import withDisabledSubjectRequired from "../../enhancers/withDisabledSubjectRequired";
import withSubject from "../../enhancers/withSubject";
import PromptFields from "./PromptFields";
import PromptPreview from "./PromptPreview";

type OneToManyDyadCensusPromptsProps = {
	form: string;
	entity?: string;
	type?: string;
	disabled?: boolean;
};

const OneToManyDyadCensusPrompts = ({ form, entity, type, disabled }: OneToManyDyadCensusPromptsProps) => (
	<Section
		disabled={disabled}
		summary={
			<p>
				Add one or more prompts below to frame the task for the user. You can reorder the prompts using the draggable
				handles on the left hand side.
			</p>
		}
		title="Prompts"
	>
		<EditableList
			previewComponent={PromptPreview}
			editComponent={PromptFields}
			title="Edit Prompt"
			fieldName="prompts"
			form={form}
			editProps={{ entity, type }}
		/>
	</Section>
);

export { OneToManyDyadCensusPrompts };

export default compose(
	withSubject,
	withDisabledSubjectRequired,
)(OneToManyDyadCensusPrompts as React.ComponentType<unknown>);
