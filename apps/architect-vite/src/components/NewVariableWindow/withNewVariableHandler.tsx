import type { UnknownAction } from "@reduxjs/toolkit";
import { values } from "lodash";
import { connect } from "react-redux";
import { compose, withHandlers } from "recompose";
import { formValueSelector } from "redux-form";
import type { RootState } from "~/ducks/modules/root";
import { createVariableAsync } from "../../ducks/modules/protocol/codebook";
import { getVariablesForSubject } from "../../selectors/codebook";

export const form = "create-new-variable";

type Entity = "node" | "edge" | "ego";

type Variable = {
	name: string;
	type: string;
	[key: string]: unknown;
};

type OwnProps = {
	entity: Entity;
	type: string;
	onComplete: (variable: string) => void;
};

const mapStateToProps = (state: RootState, { entity, type }: OwnProps) => {
	const variableType = formValueSelector(form)(state, "type");
	const existingVariables = getVariablesForSubject(state, { entity, type });
	const existingVariableNames = values(existingVariables).map(({ name }: Variable) => name);

	return {
		variableType,
		existingVariableNames,
	};
};

const mapDispatchToProps = { createVariable: createVariableAsync };

type StateProps = ReturnType<typeof mapStateToProps>;
type DispatchProps = typeof mapDispatchToProps;

type HandlerProps = StateProps & DispatchProps & OwnProps;

const newVariableHandlers = withHandlers<
	HandlerProps,
	{
		handleCreateNewVariable: (configuration: Partial<Variable>) => Promise<void>;
	}
>({
	handleCreateNewVariable:
		({ entity, type, createVariable, onComplete }) =>
		async (configuration: Partial<Variable>) => {
			type CreateVariableResult = UnknownAction & {
				payload?: { entity: Entity; type?: string; variable: string };
			};
			const thunk = createVariable as unknown as (params: {
				entity: Entity;
				type?: string;
				configuration: Partial<Variable>;
			}) => Promise<CreateVariableResult>;
			const result = await thunk({ entity, type, configuration });
			// Extract variable from the fulfilled payload
			if (result?.payload?.variable) {
				onComplete(result.payload.variable);
			}
		},
});

const withNewVariableHandler = compose(connect(mapStateToProps, mapDispatchToProps), newVariableHandlers);

export default withNewVariableHandler;
