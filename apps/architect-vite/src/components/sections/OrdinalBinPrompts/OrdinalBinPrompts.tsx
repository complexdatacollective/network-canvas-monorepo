import { compose } from "recompose";
import EditableList from "~/components/EditableList";
import { Section } from "~/components/EditorLayout";
import withDisabledSubjectRequired from "~/components/enhancers/withDisabledSubjectRequired";
import withSubject from "~/components/enhancers/withSubject";
import type { StageEditorSectionProps } from "~/components/StageEditor/Interfaces";
import { itemSelector } from "~/components/sections/CategoricalBinPrompts/helpers";
import withPromptChangeHandler from "~/components/sections/CategoricalBinPrompts/withPromptChangeHandler";
import { PromptPreview } from "~/components/sections/NameGeneratorPrompts";
import PromptFields from "./PromptFields";

const template = () => ({ color: "ord-color-seq-1" });

type OrdinalBinPromptsProps = StageEditorSectionProps & {
	handleChangePrompt: (data: unknown) => void;
	entity?: string | null;
	type?: string | null;
	disabled?: boolean;
};

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
			previewComponent={PromptPreview as React.ComponentType<Record<string, unknown>>}
			editComponent={PromptFields}
			title="Edit Prompt"
			template={template}
			onChange={handleChangePrompt}
			itemSelector={
				itemSelector(entity, type) as (
					state: Record<string, unknown>,
					params: { form: string; editField: string },
				) => unknown
			}
			editProps={{ entity, type }}
			form={form}
		/>
	</Section>
);

export default compose<OrdinalBinPromptsProps, StageEditorSectionProps>(
	withSubject,
	withDisabledSubjectRequired,
	withPromptChangeHandler,
)(OrdinalBinPrompts);
