import { compose } from "recompose";
import { Section } from "~/components/EditorLayout";
import EditableList from "../../EditableList";
import withDisabledSubjectRequired from "../../enhancers/withDisabledSubjectRequired";
import withSubject from "../../enhancers/withSubject";
import { itemSelector } from "./helpers";
import PromptFields from "./PromptFields";
import PromptPreview from "./PromptPreview";
import withPromptChangeHandler from "./withPromptChangeHandler";

type TieStrengthCensusPromptsProps = {
	handleChangePrompt: (prompts: any[]) => void;
} & Record<string, any>;

const TieStrengthCensusPrompts = ({
	handleChangePrompt,
	form,
	entity,
	type,
	disabled,
}: TieStrengthCensusPromptsProps & { form: string; entity?: string; type?: string; disabled?: boolean }) => (
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
			itemSelector={itemSelector()}
			onChange={handleChangePrompt}
			form={form}
			editProps={{ entity, type }}
		/>
	</Section>
);

export { TieStrengthCensusPrompts };

export default compose(withSubject, withDisabledSubjectRequired, withPromptChangeHandler)(TieStrengthCensusPrompts);
