import type { ComponentType } from "react";
import { type BaseFieldArrayProps, FieldArray, type WrappedFieldArrayProps } from "redux-form";
import useValidate from "~/hooks/useValidate";

type ValidatedFieldArrayProps = {
	name: string;
	// biome-ignore lint/suspicious/noExplicitAny: redux-form FieldArray accepts any component with WrappedFieldArrayProps
	component: ComponentType<WrappedFieldArrayProps<unknown>> | ComponentType<any>;
	validation: Record<string, unknown>;
} & Omit<BaseFieldArrayProps<unknown>, "validate">;

const ValidatedFieldArray = ({ validation, name, component, ...rest }: ValidatedFieldArrayProps) => {
	const validate = useValidate(validation);

	return (
		<FieldArray
			name={name}
			component={component}
			{...rest} // eslint-disable-line react/jsx-props-no-spreading
			validate={validate}
		/>
	);
};

export default ValidatedFieldArray;
