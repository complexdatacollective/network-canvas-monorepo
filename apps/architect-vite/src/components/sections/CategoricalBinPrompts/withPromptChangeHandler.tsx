import { connect } from "react-redux";
import { compose, withHandlers } from "recompose";
import type { FormAction } from "redux-form";
import { change } from "redux-form";
import { updateVariableAsync } from "../../../ducks/modules/protocol/codebook";

const store = connect(null, {
	updateVariable: updateVariableAsync,
	changeForm: change,
});

type HandlerProps = {
	updateVariable: typeof updateVariableAsync;
	changeForm: (form: string, field: string, value: unknown) => FormAction;
	form: string;
	entity: string;
	type: string;
};

const handlers = withHandlers({
	handleChangePrompt:
		(props: HandlerProps) =>
		async ({
			variable,
			variableOptions,
			...rest
		}: {
			variable: string;
			variableOptions: unknown;
			[key: string]: unknown;
		}) => {
			props.changeForm(props.form, "_modified", Date.now()); // TODO: can we avoid this?

			await props.updateVariable({
				entity: props.entity as "node" | "edge" | "ego",
				type: props.type,
				variable,
				configuration: { options: variableOptions } as Record<string, unknown>,
				merge: true,
			});

			return { variable, ...rest };
		},
});

const withPromptChangeHandler = compose(store, handlers);

export default withPromptChangeHandler;
