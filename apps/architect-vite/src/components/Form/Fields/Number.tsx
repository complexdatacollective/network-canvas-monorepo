import { has } from "lodash";
import TextInput from "./Text";

interface NumberInputProps {
	input?: {
		name?: string;
		value?: string;
		onChange?: (value: number | null) => void;
		onBlur?: (value: number | null) => void;
		[key: string]: unknown;
	};
	placeholder?: string;
	[key: string]: unknown;
}

const toInt = (value: string): number | null => {
	const int = Number.parseInt(value, 10);
	if (Number.isNaN(int)) {
		return null;
	}
	return int;
};

const NumberInput = ({ input = {}, placeholder, ...props }: NumberInputProps) => {
	const enhancedInput = {
		...input,
		onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
			has(props, "input.onChange") && input.onChange?.(toInt(e.target.value)),
		onBlur: (e: React.FocusEvent<HTMLInputElement>) =>
			has(props, "input.onBlur") && input.onBlur?.(toInt(e.target.value)),
	};

	return <TextInput type="number" placeholder={placeholder || "Enter a number..."} input={enhancedInput} {...props} />;
};

export default NumberInput;
