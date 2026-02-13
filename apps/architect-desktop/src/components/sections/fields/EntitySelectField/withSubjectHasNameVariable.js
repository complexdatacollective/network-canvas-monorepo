import { getVariablesForSubject } from "@selectors/codebook";
import { toPairs } from "lodash";
import { connect } from "react-redux";
import { formValueSelector } from "redux-form";

const withSubjectNameVariablesState = connect((state) => {
	const subject = formValueSelector("edit-stage")(state, "subject");
	const entity = subject?.entity;
	const type = subject?.type;
	const variablesCalledName = toPairs(getVariablesForSubject(state, { entity, type })).some(
		([, { name }]) => name === "name",
	);
	return {
		...subject,
		subjectHasVariableCalledName: !!variablesCalledName,
	};
});

export default withSubjectNameVariablesState;
