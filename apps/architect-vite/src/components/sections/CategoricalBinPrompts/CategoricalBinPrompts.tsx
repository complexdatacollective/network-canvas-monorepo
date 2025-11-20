import { compose } from "recompose";
import { Section } from "~/components/EditorLayout";
import EditableList from "../../EditableList";
import withDisabledSubjectRequired from "../../enhancers/withDisabledSubjectRequired";
import withSubject from "../../enhancers/withSubject";
import { PromptPreview } from "../NameGeneratorPrompts";
import { itemSelector, normalizeField } from "./helpers";
import PromptFields from "./PromptFields";
import withPromptChangeHandler from "./withPromptChangeHandler";

type CategoricalBinPromptsProps = {
	handleChangePrompt: (value: Record<string, unknown>) => void;
	entity?: string;
	type?: string;
	form: string;
	disabled?: boolean;
};

const CategoricalBinPrompts = ({
	handleChangePrompt,
	entity = null,
	type = null,
	form,
	disabled,
}: CategoricalBinPromptsProps) => (
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
			onChange={handleChangePrompt}
			normalize={normalizeField}
			itemSelector={itemSelector(entity, type)}
			editProps={{ entity, type }}
			form={form}
		/>
	</Section>
);

export { CategoricalBinPrompts };

export default compose(withSubject, withDisabledSubjectRequired, withPromptChangeHandler)(
	CategoricalBinPrompts as React.ComponentType<unknown>,
);
