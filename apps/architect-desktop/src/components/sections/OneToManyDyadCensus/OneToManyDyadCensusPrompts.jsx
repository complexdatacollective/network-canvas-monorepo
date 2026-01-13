import React from "react";
import { compose } from "recompose";
import EditableList from "../../EditableList";
import withDisabledSubjectRequired from "../../enhancers/withDisabledSubjectRequired";
import withSubject from "../../enhancers/withSubject";
import PromptFields from "./PromptFields";
import PromptPreview from "./PromptPreview";

const OneToManyDyadCensusPrompts = (props) => (
	<EditableList
		sectionTitle="Prompts"
		sectionSummary={
			<p>
				Add one or more prompts below to frame the task for the user. You can reorder the prompts using the draggable
				handles on the left hand side.
			</p>
		}
		previewComponent={PromptPreview}
		editComponent={PromptFields}
		title="Edit Prompt"
		fieldName="prompts"
		// eslint-disable-next-line react/jsx-props-no-spreading
		{...props}
	/>
);

export { OneToManyDyadCensusPrompts };

export default compose(withSubject, withDisabledSubjectRequired)(OneToManyDyadCensusPrompts);
