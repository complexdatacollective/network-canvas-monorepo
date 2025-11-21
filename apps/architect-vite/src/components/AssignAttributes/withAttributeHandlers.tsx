import { get } from "es-toolkit/compat";
import { connect } from "react-redux";
import { compose, withHandlers } from "recompose";
import { formValueSelector } from "redux-form";
import type { RootState } from "~/ducks/modules/root";
import { getVariablesForSubject } from "../../selectors/codebook";

type OwnProps = {
	entity: "node" | "edge" | "ego";
	type?: string;
	form: string;
	field: string;
};

type HandlerProps = OwnProps & {
	onDelete: (index: number) => void;
	index: number;
};

const store = connect((state: RootState, { entity, type, form, field }: OwnProps) => {
	const variable = formValueSelector(form)(state, `${field}.variable`) as string | undefined;
	const codebookVariables = getVariablesForSubject(state, { entity, type });
	const variableType = variable ? get(codebookVariables, [variable, "type"]) : undefined;
	const options = variable ? get(codebookVariables, [variable, "options"]) : undefined;

	return {
		variableType,
		variable,
		options,
	};
});

const handlers = withHandlers<HandlerProps, object>({
	handleDelete:
		({ onDelete, index }: HandlerProps) =>
		() =>
			onDelete(index),
});

export default compose(store, handlers);
