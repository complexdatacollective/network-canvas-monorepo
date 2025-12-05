import { connect } from "react-redux";
import { compose, withHandlers } from "recompose";
import { change, formValueSelector } from "redux-form";
import { createVariableAsync, deleteVariableAsync } from "~/ducks/modules/protocol/codebook";
import type { AppDispatch, RootState } from "~/ducks/store";
import { getEdgesForSubject, getNarrativeVariables } from "./selectors";

const mapStateToProps = (state: RootState, { entity, type, form }: { entity: string; type: string; form: string }) => {
	const narrativeVariables = getNarrativeVariables(state, {
		entity: entity as "node" | "edge" | "ego",
		type,
	});
	const edgesForSubject = getEdgesForSubject(state);
	const formSelector = formValueSelector(form);
	const layoutVariable = formSelector(state, "layoutVariable") as string | undefined;
	const groupVariable = formSelector(state, "groupVariable") as string | undefined;

	return {
		...narrativeVariables,
		edgesForSubject,
		groupVariable,
		layoutVariable,
	};
};

const mapDispatchToProps = {
	createVariable: createVariableAsync,
	deleteVariable: deleteVariableAsync,
	changeForm: change,
};

type HandlerProps = {
	form: string;
	changeForm: typeof change;
	createVariable: typeof createVariableAsync;
	deleteVariable: typeof deleteVariableAsync;
	entity: string;
	type: string;
	dispatch: AppDispatch;
};

const variableHandlers = withHandlers({
	handleCreateLayoutVariable:
		({ form, changeForm, createVariable, dispatch, entity, type }: HandlerProps) =>
		async (name: string) => {
			const result = await dispatch(
				createVariable({
					entity: entity as "node" | "edge" | "ego",
					type,
					configuration: { type: "layout", name },
				}),
			).unwrap();
			const { variable } = result;
			changeForm(form, "layoutVariable", variable);
			return variable;
		},
	handleDeleteVariable:
		({ entity, type, deleteVariable }: HandlerProps) =>
		(variable: string) =>
			deleteVariable({
				entity: entity as "node" | "edge" | "ego",
				type,
				variable,
			}),
});

const withPresetProps = compose(connect(mapStateToProps, mapDispatchToProps), variableHandlers);

export default withPresetProps;
