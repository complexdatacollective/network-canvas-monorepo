import { memo, type ReactNode, useMemo, useRef } from "react";
import { v4 as uuid } from "uuid";
import { BaseField } from "~/components/Form/BaseField";
import {
	controlVariants,
	heightVariants,
	inlineSpacingVariants,
	inputControlVariants,
	interactiveStateVariants,
	placeholderVariants,
	proportionalLucideIconVariants,
	stateVariants,
	textSizeVariants,
	wrapperPaddingVariants,
} from "~/styles/shared/controlVariants";
import { compose, cva, cx } from "~/utils/cva";
import { getInputState } from "~/utils/getInputState";

const inputWrapperVariants = compose(
	heightVariants,
	textSizeVariants,
	controlVariants,
	inputControlVariants,
	inlineSpacingVariants,
	wrapperPaddingVariants,
	proportionalLucideIconVariants,
	stateVariants,
	interactiveStateVariants,
	cva({
		base: cx("max-w-full min-w-0", "w-auto shrink-0", "[&_button]:h-10"),
	}),
);

const inputVariants = compose(
	placeholderVariants,
	cva({
		base: cx(
			"cursor-[inherit]",
			"[font-size:inherit]",
			"p-0",
			"field-sizing-content min-w-0 grow basis-0",
			"border-none bg-transparent outline-none focus:ring-0",
			"transition-none",
			"[&::-webkit-search-cancel-button]:hidden",
			"[&::-webkit-search-decoration]:hidden",
		),
	}),
);

type TextInputProps = {
	input?: {
		name?: string;
		value?: string;
		onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
		onBlur?: (event: React.FocusEvent<HTMLInputElement>) => void;
		onFocus?: (event: React.FocusEvent<HTMLInputElement>) => void;
		[key: string]: unknown;
	};
	meta?: {
		error?: string;
		invalid?: boolean;
		touched?: boolean;
	};
	label?: string | null;
	placeholder?: string | number;
	fieldLabel?: string | null;
	className?: string;
	type?: "text" | "number" | "search";
	autoFocus?: boolean;
	hidden?: boolean;
	disabled?: boolean;
	readOnly?: boolean;
	required?: boolean;
	hint?: ReactNode;
	adornmentLeft?: ReactNode;
	adornmentRight?: ReactNode;
};

const TextInput = ({
	input = {},
	meta = {},
	label = null,
	placeholder = "Enter some text...",
	fieldLabel = null,
	className,
	type = "text",
	autoFocus: _autoFocus = false,
	hidden = false,
	disabled = false,
	readOnly = false,
	required = false,
	hint,
	adornmentLeft = null,
	adornmentRight = null,
}: TextInputProps) => {
	const { error, invalid, touched } = meta;
	const idRef = useRef(uuid());
	const id = idRef.current;

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
			containerProps={hidden ? { hidden: true } : undefined}
		>
			<div className={cx(inputWrapperVariants({ state }), className)}>
				{adornmentLeft}
				<input
					{...input}
					id={id}
					type={type}
					placeholder={placeholder?.toString()}
					disabled={disabled}
					readOnly={readOnly}
					aria-required={required || undefined}
					aria-invalid={showErrors || undefined}
					aria-describedby={describedBy}
					className={inputVariants()}
				/>
				{adornmentRight}
			</div>
		</BaseField>
	);
};

export default memo(TextInput);
