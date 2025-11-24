import { connect } from "react-redux";
import { change, formValueSelector } from "redux-form";
import type { RootState } from "~/ducks/modules/root";
import type { AppDispatch } from "~/ducks/store";
import { getValidationOptionsForVariableType } from "./options";

const mapStateToProps = (
	state: RootState,
	{ form, name, variableType, entity }: { form: string; name: string; variableType: string; entity: string },
) => {
	const validationOptions = getValidationOptionsForVariableType(variableType, entity);
	return {
		validationOptions,
		value: formValueSelector(form)(state, name),
	};
};

const mapDispatchToProps = (dispatch: AppDispatch, { form, name }: { form: string; name: string }) => ({
	update: (value: unknown) => dispatch(change(form, name, value)),
});

export default connect(mapStateToProps, mapDispatchToProps);
