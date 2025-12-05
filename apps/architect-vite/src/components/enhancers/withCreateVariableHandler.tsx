import { isEmpty } from "lodash";
import { connect } from "react-redux";
import { compose, withHandlers } from "recompose";
import { change } from "redux-form";
import { createVariableAsync, deleteVariableAsync } from "../../ducks/modules/protocol/codebook";
import safeName from "../../utils/safeName";

const mapDispatchToProps = {
	createVariable: createVariableAsync,
	deleteVariable: deleteVariableAsync,
	changeField: change,
};

const normalizeKeyDown = (event: React.KeyboardEvent) => {
	const check = safeName(event.key);

	if (isEmpty(check)) {
		event.preventDefault();
	}
};

type ConnectedProps = {
	createVariable: typeof createVariableAsync;
	deleteVariable: typeof deleteVariableAsync;
	changeField: typeof change;
};

type OwnProps = {
	type: string;
	entity: string;
	form: string;
};

type Entity = "node" | "edge" | "ego";

type HandlerProps = ConnectedProps & OwnProps;

const createVariableHandler = {
	handleCreateVariable:
		({ changeField, createVariable, type, entity, form }: HandlerProps) =>
		async (variableName: string, variableType?: string, field?: string) => {
			const withType = variableType ? { type: variableType } : {};

			const configuration = {
				name: variableName,
				...withType,
			};

			const result = (await createVariable({
				entity: entity as Entity,
				type,
				configuration,
			})) as unknown as {
				payload: { entity: Entity; type?: string; variable: string };
			};
			const variable = result.payload.variable;

			// If we supplied a field, update it with the result of the variable creation
			if (field) {
				changeField(form, field, variable);
			}

			return variable;
		},
	handleDeleteVariable:
		({ deleteVariable, type, entity }: HandlerProps) =>
		(variableId: string) =>
			deleteVariable({ entity: entity as Entity, type, variable: variableId }),
	normalizeKeyDown: () => normalizeKeyDown,
};

/**
 * usage:
 * withCreateVariableHandler(MyComponent)
 *
 * MyComponent = (handleCreateVariable) => (
 *   <div handler={() => handleCreateVariable(value, type)} />
 * )
 */
const withCreateVariableHandler = compose(
	connect(null, mapDispatchToProps),
	withHandlers<HandlerProps, object>(createVariableHandler),
);

export default withCreateVariableHandler;
