import { withProps, compose } from "recompose";
import { has } from "lodash";
import TextInput from "./Text";

const toInt = (value: string): number | null => {
	const int = Number.parseInt(value, 10);
	if (Number.isNaN(int)) {
		return null;
	}
	return int;
};

const withNumericChangeHandlers = withProps((props: any) => ({
	type: "number",
	placeholder: props.placeholder ? props.placeholder : "Enter a number...",
	input: {
		...props.input,
		onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
			has(props, "input.onChange") && props.input.onChange(toInt(e.target.value)),
		onBlur: (e: React.FocusEvent<HTMLInputElement>) =>
			has(props, "input.onBlur") && props.input.onBlur(toInt(e.target.value)),
	},
}));

export default compose(withNumericChangeHandlers)(TextInput);
