type ReduxFormMeta = {
	touched?: boolean;
	invalid?: boolean;
};

type InputStateProps = {
	disabled?: boolean;
	readOnly?: boolean;
	meta?: ReduxFormMeta;
};

export type InputState = "normal" | "disabled" | "readOnly" | "invalid";

export function getInputState({ disabled, readOnly, meta }: InputStateProps): InputState {
	if (disabled) return "disabled";
	if (readOnly) return "readOnly";
	if (meta?.touched && meta?.invalid) return "invalid";
	return "normal";
}
