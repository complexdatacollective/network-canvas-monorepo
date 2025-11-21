import type { Dispatch, UnknownAction } from "@reduxjs/toolkit";
import { difference, get, keys } from "es-toolkit/compat";
import { useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { change, getFormValues } from "redux-form";
import { Row, Section } from "~/components/EditorLayout";
import type { StageEditorSectionProps } from "~/components/StageEditor/Interfaces";
import type { RootState } from "~/ducks/modules/root";
// Screen message listeners removed as part of screen system refactor
import { ValidatedField } from "../Form";
import IssueAnchor from "../IssueAnchor";
import Filter from "./Filter";
import EntitySelectField from "./fields/EntitySelectField/EntitySelectField";
import { SUBJECT_INDEPENDENT_FIELDS } from "./NodeType";

export type FilteredEdgeTypeProps = StageEditorSectionProps;

const FilteredEdgeType = (props: FilteredEdgeTypeProps) => {
	const { form } = props;

	const dispatch = useDispatch<Dispatch<UnknownAction>>();
	const formValues = useSelector((state: RootState) => getFormValues(form)(state));
	const fields = keys(formValues);

	const handleResetStage = useCallback(() => {
		const fieldsToReset = difference(fields, SUBJECT_INDEPENDENT_FIELDS);
		fieldsToReset.forEach((field) => dispatch(change(form, field, null) as UnknownAction));
	}, [dispatch, fields, form]);

	const _currentSubject = get(formValues, "subject");

	// TODO: Restore auto-selection of newly created types when type creation dialogs
	// are properly integrated with form state management

	return (
		<Section title="Edge Type">
			<Row>
				<IssueAnchor fieldName="subject" description="Edge Type" />
				<ValidatedField
					name="subject"
					entityType="edge"
					promptBeforeChange="You attempted to change the edge type of a stage that you have already configured. Before you can proceed the stage must be reset, which will remove any existing configuration. Do you want to reset the stage now?"
					component={EntitySelectField}
					onChange={handleResetStage}
					parse={(value) => ({ type: value, entity: "edge" })}
					format={(value) => get(value, "type")}
					validation={{ required: true }}
				/>
			</Row>
			<Filter
				// eslint-disable-next-line react/jsx-props-no-spreading
				{...props}
			/>
		</Section>
	);
};

export default FilteredEdgeType;
