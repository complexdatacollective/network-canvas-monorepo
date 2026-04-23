import { type ReactNode, useMemo, useRef } from "react";
import { v4 as uuid } from "uuid";
import { BaseField } from "~/components/Form/BaseField";
import { getInputState } from "~/utils/getInputState";
import RichText from "./RichText";

type RichTextFieldProps = {
	input: {
		name?: string;
		value: string;
		onChange: (value: string) => void;
		onFocus?: React.FocusEventHandler;
		onBlur?: React.FocusEventHandler;
	};
	meta?: {
		error?: string;
		active?: boolean;
		invalid?: boolean;
		touched?: boolean;
	};
	label?: string | null;
	fieldLabel?: string | null;
	placeholder?: string;
	autoFocus?: boolean;
	inline?: boolean;
	disallowedTypes?: string[];
	className?: string | null;
	disabled?: boolean;
	readOnly?: boolean;
	required?: boolean;
	hint?: ReactNode;
};

const RichTextField = ({
	input,
	meta = {},
	label = null,
	fieldLabel = null,
	placeholder,
	autoFocus = false,
	inline = false,
	disallowedTypes = [],
	className = null,
	disabled = false,
	readOnly = false,
	required = false,
	hint,
}: RichTextFieldProps) => {
	const idRef = useRef(uuid());
	const id = idRef.current;

	const { error, invalid, touched } = meta;

	const state = getInputState({ disabled, readOnly, meta });
	const showErrors = Boolean(touched && invalid && error);
	const errors = useMemo(() => (error ? [error] : []), [error]);

	const describedBy =
		[hint ? `${id}-hint` : null, showErrors ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;

	const anyLabel = fieldLabel ?? label ?? undefined;

	return (
		<BaseField
			id={id}
			name={input.name}
			label={anyLabel ?? undefined}
			hint={hint}
			required={required}
			errors={errors}
			showErrors={showErrors}
		>
			<RichText
				id={id}
				className={className ?? undefined}
				value={input.value}
				onChange={input.onChange}
				placeholder={placeholder}
				autoFocus={autoFocus}
				inline={inline}
				disallowedTypes={disallowedTypes}
				state={state}
				ariaInvalid={showErrors || undefined}
				ariaRequired={required || undefined}
				ariaDescribedBy={describedBy}
			/>
		</BaseField>
	);
};

export default RichTextField;
