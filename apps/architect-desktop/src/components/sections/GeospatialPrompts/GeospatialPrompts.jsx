/* eslint-disable react/jsx-props-no-spreading */
import React from "react";
import { compose } from "recompose";
import EditableList from "../../EditableList";
import withDisabledSubjectRequired from "../../enhancers/withDisabledSubjectRequired";
import withSubject from "../../enhancers/withSubject";
import PromptFields from "./PromptFields";
import PromptPreview from "./PromptPreview";

// TODO no prop spreading
const GeospatialPrompts = (props) => (
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
		{...props}
	/>
);

export default compose(withSubject, withDisabledSubjectRequired)(GeospatialPrompts);
