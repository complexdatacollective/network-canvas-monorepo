import { get } from "es-toolkit/compat";
import { withProps } from "recompose";

type FieldInputProps = {
	input: {
		value: {
			rules?: unknown[];
			join?: string;
		};
		onChange: (value: unknown) => void;
	};
	meta: {
		error?: string;
	};
};

type OutputProps = {
	rules: unknown[];
	join: string | undefined;
	onChange: (value: unknown) => void;
	error: string | undefined;
};

const withFieldConnector = withProps<OutputProps, FieldInputProps>((props) => ({
	rules: get(props.input.value, "rules", []) as unknown[],
	join: get(props.input.value, "join") as string | undefined,
	onChange: props.input.onChange,
	error: props.meta.error,
}));

export default withFieldConnector;
