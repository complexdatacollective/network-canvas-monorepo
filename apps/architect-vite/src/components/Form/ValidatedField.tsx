import { Field } from "redux-form";
import useValidate from "~/hooks/useValidate";

type ValidatedFieldProps = {
	validation: Record<string, any>;
} & Record<string, any>;

const ValidatedField = ({ validation, ...rest }: ValidatedFieldProps) => {
	const validations = useValidate(validation);

	return (
		<Field
			{...rest} // eslint-disable-line react/jsx-props-no-spreading
			validate={validations}
		/>
	);
};


export default ValidatedField;
