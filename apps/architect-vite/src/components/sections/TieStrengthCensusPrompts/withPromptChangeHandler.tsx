import type { Dispatch } from "@reduxjs/toolkit";
import { connect } from "react-redux";
import { compose, withHandlers } from "recompose";
import { change } from "redux-form";
import { updateVariableAsync } from "../../../ducks/modules/protocol/codebook";

type Entity = "node" | "edge" | "ego";

type OwnProps = {
	form: string;
};

type DispatchProps = {
	updateVariable: typeof updateVariableAsync;
	changeForm: typeof change;
};

type HandlerProps = DispatchProps & OwnProps;

type PromptData = {
	createEdge: string;
	edgeVariable: string;
	variableOptions: unknown;
	[key: string]: unknown;
};

const store = connect(null, {
	updateVariable: updateVariableAsync,
	changeForm: change,
});

const handlers = withHandlers<
	HandlerProps,
	{
		handleChangePrompt: (data: PromptData) => Promise<Omit<PromptData, "variableOptions">>;
	}
>({
	handleChangePrompt:
		({ updateVariable, changeForm, form }) =>
		async ({ createEdge, edgeVariable, variableOptions, ...rest }: PromptData) => {
			changeForm(form, "_modified", Date.now()); // TODO: can we avoid this?
			await (updateVariable as unknown as Dispatch)({
				entity: "edge" as Entity,
				type: createEdge,
				variable: edgeVariable,
				configuration: { options: variableOptions },
				merge: true,
			});
			return { edgeVariable, createEdge, ...rest };
		},
});

const withPromptChangeHandler = compose(store, handlers);

export default withPromptChangeHandler;
