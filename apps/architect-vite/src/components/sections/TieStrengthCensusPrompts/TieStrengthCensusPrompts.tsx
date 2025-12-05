import { compose } from "recompose";
import { Section } from "~/components/EditorLayout";
import type { StageEditorSectionProps } from "~/components/StageEditor/Interfaces";
import EditableList from "../../EditableList";
import withDisabledSubjectRequired from "../../enhancers/withDisabledSubjectRequired";
import withSubject from "../../enhancers/withSubject";
import { itemSelector } from "./helpers";
import PromptFields from "./PromptFields";
import PromptPreview from "./PromptPreview";
import withPromptChangeHandler from "./withPromptChangeHandler";

type TieStrengthCensusPromptsProps = StageEditorSectionProps & {
	handleChangePrompt: (prompts: unknown[]) => void;
	entity?: string;
	type?: string;
	disabled?: boolean;
};

const TieStrengthCensusPrompts = ({
	handleChangePrompt,
	form,
	entity,
	type,
	disabled,
}: TieStrengthCensusPromptsProps) => (
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
			previewComponent={PromptPreview as React.ComponentType<Record<string, unknown>>}
			editComponent={PromptFields}
			title="Edit Prompt"
			fieldName="prompts"
			itemSelector={
				itemSelector() as (state: Record<string, unknown>, params: { form: string; editField: string }) => unknown
			}
			onChange={(prompts: unknown) => handleChangePrompt(prompts as unknown[])}
			form={form}
			editProps={{ entity, type }}
		/>
	</Section>
);

export default compose<TieStrengthCensusPromptsProps, StageEditorSectionProps>(
	withSubject,
	withDisabledSubjectRequired,
	withPromptChangeHandler,
)(TieStrengthCensusPrompts);
