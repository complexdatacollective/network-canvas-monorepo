import { values } from "lodash";
import { connect } from "react-redux";
import { compose, withHandlers } from "recompose";
import { formValueSelector } from "redux-form";
import type { RootState } from "~/ducks/modules/root";
import { actionCreators as codebookActions } from "../../ducks/modules/protocol/codebook";
import { getVariablesForSubject } from "../../selectors/codebook";

export const form = "create-new-variable";

type Entity = "node" | "edge" | "ego";

interface OwnProps {
	entity: Entity;
	type: string;
	onComplete: (variable: string) => void;
}

const mapStateToProps = (state: RootState, { entity, type }: OwnProps) => {
	const variableType = formValueSelector(form)(state, "type");
	const existingVariables = getVariablesForSubject(state, { entity, type });
	const existingVariableNames = values(existingVariables).map(({ name }) => name);

	return {
		variableType,
		existingVariableNames,
	};
};

const mapDispatchToProps = { createVariable: codebookActions.createVariable };

type HandlerProps = ReturnType<typeof mapStateToProps> & typeof mapDispatchToProps & OwnProps;

const newVariableHandlers = withHandlers<HandlerProps, Record<string, unknown>>({
	handleCreateNewVariable:
		({ entity, type, createVariable, onComplete }) =>
		async (configuration: Record<string, unknown>) => {
			const { variable } = await createVariable(entity, type, configuration);
			onComplete(variable);
		},
});

const withNewVariableHandler = compose(connect(mapStateToProps, mapDispatchToProps), newVariableHandlers);

export default withNewVariableHandler;
