import type { Validation, ValidationName } from "@codaco/protocol-validation";
import { Field, type Validator } from "redux-form";
import useValidate from "~/hooks/useValidate";

type ValidatedFieldProps = Field & {
	validation: Record<string, Validator> | Record<ValidationName, Validation>;
};

const ValidatedField = ({ validation, ...rest }: ValidatedFieldProps) => {
	const validations = useValidate(validation);

	return <Field {...rest} validate={validations} />;
};

export default ValidatedField;
