import type { Validation, ValidationName } from "@codaco/protocol-validation";
import { startCase } from "es-toolkit/compat";
import type { ComponentType } from "react";
import { type BaseFieldProps, Field, type Validator, type WrappedFieldProps } from "redux-form";
import useValidate from "~/hooks/useValidate";
import IssueAnchor from "../IssueAnchor";

// Generic T should contain ONLY the component's unique props (not WrappedFieldProps). F should be the type of the field's value.
type ValidatedFieldProps<T = {}> = Omit<BaseFieldProps, "validate" | "component" | "props"> & {
	validation: Record<string, Validator> | Record<ValidationName, Validation>;
	component: ComponentType<WrappedFieldProps & T>;
	componentProps?: T;
};

/**
 * A wrapper around redux-form's Field component that converts our validation
 * objects into a format that redux-form can understand.
 */
function ValidatedField<T = {}>({ validation, component, componentProps, ...fieldProps }: ValidatedFieldProps<T>) {
	const validations = useValidate(validation);

	return (
		<>
			<Field {...fieldProps} {...componentProps} validate={validations} component={component} />
			<IssueAnchor fieldName={`${fieldProps.name}._error`} description={startCase(fieldProps.name)} />
		</>
	);
}

export default ValidatedField;
