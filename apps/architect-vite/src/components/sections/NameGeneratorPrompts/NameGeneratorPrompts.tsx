import { compose } from "recompose";
import { Section } from "~/components/EditorLayout";
import type { StageEditorSectionProps } from "~/components/StageEditor/Interfaces";
import EditableList from "../../EditableList";
import withDisabledSubjectRequired from "../../enhancers/withDisabledSubjectRequired";
import withSubject from "../../enhancers/withSubject";
import PromptFields from "./PromptFields";
import PromptPreview from "./PromptPreview";

export type NameGeneratorPromptsProps = StageEditorSectionProps & {
	entity?: string;
	type?: string;
	disabled?: boolean;
};

const NameGeneratorPrompts = ({ disabled, entity, type, ...rest }: NameGeneratorPromptsProps) => (
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
			fieldName="prompts"
			title="Edit Prompt"
			editProps={{ entity, type }}
			{...rest}
		/>
	</Section>
);

export default compose(
	withSubject,
	withDisabledSubjectRequired,
)(NameGeneratorPrompts) as unknown as React.ComponentType<StageEditorSectionProps>;
