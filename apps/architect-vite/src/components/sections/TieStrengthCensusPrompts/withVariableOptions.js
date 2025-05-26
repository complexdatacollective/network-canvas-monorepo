import { get } from "lodash";
import { connect } from "react-redux";
import { compose, lifecycle } from "recompose";
import { change, formValueSelector } from "redux-form";
import { getVariableOptionsForSubject, getVariablesForSubject } from "~/src/selectors/codebook";

const mapStateToProps = (state, { form }) => {
	const createEdge = formValueSelector(form)(state, "createEdge");

	const variableOptions = getVariableOptionsForSubject(state, { type: createEdge, entity: "edge" }).filter(
		({ type }) => type === "ordinal",
	);

	const edgeVariable = formValueSelector(form)(state, "edgeVariable");
	const variables = getVariablesForSubject(state, { type: createEdge, entity: "edge" });
	const optionsForVariable = get(variables, [edgeVariable, "options"], []);
	const optionsForVariableDraft = formValueSelector(form)(state, "variableOptions");

	return {
		createEdge,
		edgeVariable,
		variableOptions,
		optionsForVariable,
		optionsForVariableDraft,
	};
};

const mapDispatchToProps = {
	changeForm: change,
};

const variableOptions = connect(mapStateToProps, mapDispatchToProps);

// Fix to keep redux 'sub-form' fields in sync
const updateFormVariableOptions = lifecycle({
	componentDidUpdate(previousProps) {
		const { changeForm, form, optionsForVariable, edgeVariable } = this.props;
		if (previousProps.edgeVariable === edgeVariable) {
			return;
		}

		changeForm(form, "variableOptions", optionsForVariable); // TODO: is this wrong field name?
	},
});

const withVariableOptions = compose(variableOptions, updateFormVariableOptions);

export default withVariableOptions;
