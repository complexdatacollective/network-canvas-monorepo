import { FieldArray } from "redux-form";
import useValidate from "~/hooks/useValidate";

type ValidatedFieldArrayProps = {
	validation: Record<string, any>;
} & Record<string, any>;

const ValidatedFieldArray = ({ validation, ...rest }: ValidatedFieldArrayProps) => {
	const validate = useValidate(validation);

	return (
		<FieldArray
			{...rest} // eslint-disable-line react/jsx-props-no-spreading
			validate={validate}
		/>
	);
};

export default ValidatedFieldArray;
