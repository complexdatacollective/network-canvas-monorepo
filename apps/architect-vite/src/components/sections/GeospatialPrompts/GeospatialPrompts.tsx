/* eslint-disable react/jsx-props-no-spreading */

import { compose } from "recompose";
import { Section } from "~/components/EditorLayout";
import EditableList from "../../EditableList";
import withDisabledSubjectRequired from "../../enhancers/withDisabledSubjectRequired";
import withSubject from "../../enhancers/withSubject";
import PromptFields from "./PromptFields";
import PromptPreview from "./PromptPreview";

type GeospatialPromptsProps = {
	form: string;
	entity?: string;
	type?: string;
	disabled?: boolean;
};

const GeospatialPrompts = ({ form, entity, type, disabled }: GeospatialPromptsProps) => (
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
			e="Edit Prompt"
			previewComponent={PromptPreview}
			editComponent={PromptFields}
			form={form}
			editProps={{ entity, type }}
		/>
	</Section>
);

export default compose(withSubject, withDisabledSubjectRequired)(GeospatialPrompts);
