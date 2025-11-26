import type { ComponentProps } from "react";
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
	entity?: string | null;
	type?: string | null;
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
			previewComponent={PromptPreview as React.ComponentType<Record<string, unknown>>}
			editComponent={PromptFields}
			title="Edit Prompt"
			onChange={(value: unknown) => handleChangePrompt(value as Record<string, unknown>)}
			normalize={(value: unknown) => normalizeField(value as Record<string, unknown>)}
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

export default compose<ComponentProps<typeof CategoricalBinPrompts>, typeof CategoricalBinPrompts>(
	withSubject,
	withDisabledSubjectRequired,
	withPromptChangeHandler,
)(CategoricalBinPrompts);
