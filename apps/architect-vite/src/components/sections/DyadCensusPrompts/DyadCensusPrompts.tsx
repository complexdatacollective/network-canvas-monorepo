import { compose } from "recompose";
import { Section } from "~/components/EditorLayout";
import type { StageEditorSectionProps } from "~/components/StageEditor/Interfaces";
import EditableList from "../../EditableList";
import withDisabledSubjectRequired from "../../enhancers/withDisabledSubjectRequired";
import withSubject from "../../enhancers/withSubject";
import PromptFields from "./PromptFields";
import PromptPreview from "./PromptPreview";

export type DyadCensusPromptsProps = StageEditorSectionProps & {
	entity?: string;
	type?: string;
	disabled?: boolean;
};

const DyadCensusPrompts = ({ form, entity, type, disabled }: DyadCensusPromptsProps) => (
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
			disabled={disabled}
			editProps={{ entity, type }}
		/>
	</Section>
);

export default compose(
	withSubject,
	withDisabledSubjectRequired,
)(DyadCensusPrompts) as unknown as React.ComponentType<StageEditorSectionProps>;
