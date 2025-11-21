import { connect } from "react-redux";
import { compose, withHandlers } from "recompose";
import { change, getFormValues } from "redux-form";
import { createVariableAsync, deleteVariableAsync } from "~/ducks/modules/protocol/codebook";
import type { RootState } from "~/ducks/modules/root";

type OwnProps = {
	form: string;
	entity: "node" | "edge" | "ego";
	type: string;
};

const mapStateToProps = (state: RootState, props: OwnProps) => ({
	formValues: getFormValues(props.form)(state),
});

const mapDispatchToProps = {
	deleteVariable: deleteVariableAsync,
	createVariable: createVariableAsync,
	changeForm: change,
};

const deleteVariableState = connect(mapStateToProps, mapDispatchToProps);

type HandlerProps = ReturnType<typeof mapStateToProps> & typeof mapDispatchToProps & OwnProps;

const variableHandlers = withHandlers<HandlerProps, Record<string, unknown>>({
	onCreateOtherVariable:
		({ createVariable, entity, type, form, changeForm }) =>
		async (name: string, field?: string) => {
			const result = await createVariable({ entity, type, configuration: { type: "text", name } });
			const { variable } = result.payload as { variable: string };

			// If we supplied a field, update it with the result of the variable creation
			if (field) {
				changeForm(form, field, variable);
			}

			return variable;
		},
});

const withVariableHandlers = compose(deleteVariableState, variableHandlers);

export default withVariableHandlers;
