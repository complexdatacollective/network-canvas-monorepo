import { withProps } from "recompose";
import DetachedField from "~/components/DetachedField";
import {
	Number,
	// CheckboxGroup,
	RadioGroup,
	Text,
	Toggle,
} from "~/components/Form/Fields";

// Todo: reinstate CheckboxGroup support when we switch to schema 8
const INPUT_TYPES = {
	string: Text,
	number: Number,
	boolean: Toggle,
	categorical: RadioGroup,
	ordinal: RadioGroup,
	// categorical: CheckboxGroup,
	// ordinal: CheckboxGroup,
};

/**
 * Convert variable type to input type
 */
const withMappedFieldComponent = withProps(({ variableType }) => ({
	fieldComponent: variableType && INPUT_TYPES[variableType] ? INPUT_TYPES[variableType] : Text,
}));

const getLabel = (type, value) => {
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
	onChange?: (value: unknown) => void;
	fieldComponent: React.ComponentType<Record<string, unknown>>;
	variableType: string;
};

const EditValue = ({
	fieldComponent: FieldComponent,
	value,
	variableType,
	onChange = () => {},
	options = [],
	...rest
}: EditValueProps) => (
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

export default withMappedFieldComponent(EditValue);
