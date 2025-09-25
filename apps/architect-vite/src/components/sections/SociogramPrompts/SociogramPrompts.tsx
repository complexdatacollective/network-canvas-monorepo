/* eslint-disable react/jsx-props-no-spreading */

import { compose } from "recompose";
import EditableList from "../../EditableList";
import withSubject from "../../enhancers/withSubject";
import withDisabledSubjectRequired from "../../enhancers/withDisabledSubjectRequired";
import withFormUsedVariableIndex from "./withFormUsedVariableIndex";
import PromptPreview from "./PromptPreview";
import PromptFields from "./PromptFields";

type SociogramPromptsProps = {
	form: string;
	entity?: string;
	type?: string;
	disabled?: boolean;
	usedVariableIndex?: Record<string, unknown>;
};

const SociogramPrompts = ({ form, entity, type, disabled, usedVariableIndex }: SociogramPromptsProps) => (
	<EditableList
		sectionTitle="Prompts"
		sectionSummary={
			<p>
				Add one or more prompts below to frame the task for the user. You can reorder the prompts using the draggable
				handles on the left hand side.
			</p>
		}
		title="Edit Prompt"
		previewComponent={PromptPreview}
		editComponent={PromptFields}
		form={form}
		disabled={disabled}
		editProps={{ entity, type, usedVariableIndex }}
	/>
);

export default compose(withSubject, withFormUsedVariableIndex, withDisabledSubjectRequired)(SociogramPrompts);
