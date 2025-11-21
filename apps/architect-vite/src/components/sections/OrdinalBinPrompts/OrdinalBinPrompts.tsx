import { compose } from "recompose";
import EditableList from "~/components/EditableList";
import { Section } from "~/components/EditorLayout";
import withDisabledSubjectRequired from "~/components/enhancers/withDisabledSubjectRequired";
import withSubject from "~/components/enhancers/withSubject";
import { itemSelector } from "~/components/sections/CategoricalBinPrompts/helpers";
import withPromptChangeHandler from "~/components/sections/CategoricalBinPrompts/withPromptChangeHandler";
import { PromptPreview } from "~/components/sections/NameGeneratorPrompts";
import PromptFields from "./PromptFields";

const template = () => ({ color: "ord-color-seq-1" });

interface OrdinalBinPromptsProps {
	handleChangePrompt: (data: unknown) => void;
	entity?: string | null;
	type?: string | null;
	form: string;
	disabled?: boolean;
}

const OrdinalBinPrompts = ({
	handleChangePrompt,
	entity = null,
	type = null,
	form,
	disabled,
}: OrdinalBinPromptsProps) => (
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
			template={template}
			onChange={handleChangePrompt}
			itemSelector={itemSelector(entity, type)}
			editProps={{ entity, type }}
			form={form}
		/>
	</Section>
);

export default compose(
	withSubject,
	withDisabledSubjectRequired,
	withPromptChangeHandler,
)(OrdinalBinPrompts as React.ComponentType<unknown>);
