import { toPairs } from "es-toolkit/compat";
import { connect } from "react-redux";
import { formValueSelector } from "redux-form";
import { getVariablesForSubject } from "~/selectors/codebook";

const withSubjectNameVariablesState = connect((state) => {
	const subject = formValueSelector("edit-stage")(state, "subject");
	const entity = subject && subject.entity;
	const type = subject && subject.type;
	const variablesCalledName = toPairs(getVariablesForSubject(state, { entity, type })).some(
		([, { name }]) => name === "name",
	);
	return {
		...subject,
		subjectHasVariableCalledName: !!variablesCalledName,
	};
});

export default withSubjectNameVariablesState;
