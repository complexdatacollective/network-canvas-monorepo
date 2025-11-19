import type { UnknownAction } from "@reduxjs/toolkit";
import { connect } from "react-redux";
import { compose, withHandlers } from "recompose";
import { change, formValueSelector } from "redux-form";
import { actionCreators as codebookActions } from "~/ducks/modules/protocol/codebook";
import type { RootState } from "~/ducks/store";
import { getEdgesForSubject, getNarrativeVariables } from "./selectors";

const mapStateToProps = (state: RootState, { entity, type, form }: { entity: string; type: string; form: string }) => {
	const narrativeVariables = getNarrativeVariables(state, { entity, type });
	const edgesForSubject = getEdgesForSubject(state, { entity, type });
	const formSelector = formValueSelector(form);
	const layoutVariable = formSelector(state, "layoutVariable");
	const groupVariable = formSelector(state, "groupVariable");

	return {
		...narrativeVariables,
		edgesForSubject,
		groupVariable,
		layoutVariable,
	};
};

const mapDispatchToProps = {
	createVariable: codebookActions.createVariable,
	deleteVariable: codebookActions.deleteVariable,
	changeForm: change,
};

type HandlerProps = {
	form: string;
	changeForm: typeof change;
	createVariable: typeof codebookActions.createVariable;
	deleteVariable: typeof codebookActions.deleteVariable;
	entity: string;
	type: string;
};

const variableHandlers = withHandlers<HandlerProps, HandlerProps>({
	handleCreateLayoutVariable:
		({ form, changeForm, createVariable, entity, type }: HandlerProps) =>
		async (name: string) => {
			const result = await createVariable({ entity, type, configuration: { type: "layout", name } });
			const { variable } = result.payload;
			changeForm(form, "layoutVariable", variable) as UnknownAction;
			return variable;
		},
	handleDeleteVariable:
		({ entity, type, deleteVariable }: HandlerProps) =>
		(variable: string) =>
			deleteVariable({ entity, type, variable }),
});

const withPresetProps = compose(connect(mapStateToProps, mapDispatchToProps), variableHandlers);

export default withPresetProps;
