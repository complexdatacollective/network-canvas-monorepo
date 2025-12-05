import type { UnknownAction } from "@reduxjs/toolkit";
import { get } from "es-toolkit/compat";
import { connect } from "react-redux";
import { compose, lifecycle } from "recompose";
import { change, formValueSelector } from "redux-form";
import type { RootState } from "~/ducks/store";
import { getVariableOptionsForSubject, getVariablesForSubject } from "~/selectors/codebook";

const mapStateToProps = (state: RootState, { form }: { form: string }) => {
	const formSelector = formValueSelector(form);
	const createEdge = formSelector(state, "createEdge");

	const variableOptions = getVariableOptionsForSubject(state, {
		type: createEdge,
		entity: "edge",
	}).filter(({ type }) => type === "ordinal");

	const edgeVariable = formSelector(state, "edgeVariable");
	const variables = getVariablesForSubject(state, {
		type: createEdge,
		entity: "edge",
	});
	const optionsForVariable = get(variables, [edgeVariable, "options"], []);
	const optionsForVariableDraft = formSelector(state, "variableOptions");

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

type LifecycleProps = {
	changeForm: typeof change;
	form: string;
	optionsForVariable: unknown[];
	edgeVariable: string;
};

// Fix to keep redux 'sub-form' fields in sync
const updateFormVariableOptions = lifecycle<LifecycleProps, unknown>({
	componentDidUpdate(previousProps: LifecycleProps) {
		const { changeForm, form, optionsForVariable, edgeVariable } = this.props;
		if (previousProps.edgeVariable === edgeVariable) {
			return;
		}

		changeForm(form, "variableOptions", optionsForVariable) as UnknownAction; // TODO: is this wrong field name?
	},
});

const withVariableOptions = compose(variableOptions, updateFormVariableOptions);

export default withVariableOptions;
