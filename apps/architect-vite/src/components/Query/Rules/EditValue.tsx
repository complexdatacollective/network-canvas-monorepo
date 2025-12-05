import { withProps } from "recompose";
import DetachedField from "~/components/DetachedField";
import {
	Number as NumberField,
	// CheckboxGroup,
	RadioGroup,
	Text,
	Toggle,
} from "~/components/Form/Fields";

// Todo: reinstate CheckboxGroup support when we switch to schema 8
const INPUT_TYPES = {
	string: Text,
	number: NumberField,
	boolean: Toggle,
	categorical: RadioGroup,
	ordinal: RadioGroup,
	// categorical: CheckboxGroup,
	// ordinal: CheckboxGroup,
};

const getLabel = (type: string, value: string | number | boolean): string | null => {
	if (type !== "boolean") {
		return null;
	}
	return value ? "True" : "False";
};

type OptionItem = {
	value: string | number;
	label: string;
};

type EditValueProps = {
	value: string | number | boolean;
	options?: OptionItem[];
	onChange?: (event: unknown, value: unknown, oldValue: unknown, name: string | null) => void;
	fieldComponent?: React.ComponentType<Record<string, unknown>>;
	variableType?: string;
	placeholder?: string;
	validation?: Record<string, unknown>;
};

const EditValue = ({
	fieldComponent: FieldComponent,
	value,
	variableType = "string",
	onChange = () => {},
	options = [],
	...rest
}: EditValueProps & {
	fieldComponent: React.ComponentType<Record<string, unknown>>;
}) => (
	<DetachedField
		component={FieldComponent}
		label={getLabel(variableType, value)}
		name="value"
		onChange={onChange}
		value={value}
		options={options}
		// eslint-disable-next-line react/jsx-props-no-spreading
		{...rest}
	/>
);

type InputProps = {
	variableType?: string;
};

type MappedProps = {
	fieldComponent: React.ComponentType<Record<string, unknown>>;
};

const withMappedFieldComponent = withProps<MappedProps, InputProps>(({ variableType }: InputProps): MappedProps => {
	const fieldComponent: React.ComponentType<Record<string, unknown>> =
		variableType && INPUT_TYPES[variableType as keyof typeof INPUT_TYPES]
			? (INPUT_TYPES[variableType as keyof typeof INPUT_TYPES] as React.ComponentType<Record<string, unknown>>)
			: Text;

	return {
		fieldComponent,
	};
});

export default withMappedFieldComponent(EditValue);
