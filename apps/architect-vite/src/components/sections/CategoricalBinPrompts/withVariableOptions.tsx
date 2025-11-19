import { get } from "es-toolkit/compat";
import { connect } from "react-redux";
import { compose, lifecycle } from "recompose";
import { change, formValueSelector } from "redux-form";
import type { UnknownAction } from "@reduxjs/toolkit";
import type { RootState } from "~/ducks/store";
import { getVariableOptionsForSubject, getVariablesForSubject } from "~/selectors/codebook";

const mapStateToProps = (state: RootState, { form, type, entity }: { form: string; type?: string; entity: string }) => {
	const variableOptions = getVariableOptionsForSubject(state, { type, entity });

	const formSelector = formValueSelector(form);
	const variable = formSelector(state, "variable");
	const otherVariable = formSelector(state, "otherVariable");
	const variables = getVariablesForSubject(state, { type, entity });
	const optionsForVariable = get(variables, [variable, "options"], []);
	const optionsForVariableDraft = formSelector(state, "variableOptions");

	return {
		variable,
		otherVariable,
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
	variable: string;
};

// Fix to keep redux 'sub-form' fields in sync
const updateFormVariableOptions = lifecycle<LifecycleProps, unknown>({
	componentDidUpdate(previousProps: LifecycleProps) {
		const { changeForm, form, optionsForVariable, variable } = this.props;
		if (previousProps.variable === variable) {
			return;
		}
		changeForm(form, "variableOptions", optionsForVariable) as UnknownAction; // TODO: is this wrong field name?
	},
});

const withVariableOptions = compose(variableOptions, updateFormVariableOptions);

export default withVariableOptions;
