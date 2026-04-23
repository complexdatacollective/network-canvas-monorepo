import { Minus, Plus } from "lucide-react";
import { memo, type ReactNode, useCallback, useMemo, useRef } from "react";
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
		base: cx("max-w-full min-w-0", "w-auto shrink-0", "[&_button]:h-10", "gap-0! px-0!"),
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
			"[&::-webkit-outer-spin-button]:appearance-none",
			"[&::-webkit-inner-spin-button]:appearance-none",
			"[appearance:textfield]",
		),
	}),
);

const stepperButtonVariants = cx(
	"aspect-square h-full rounded-none",
	"flex items-center justify-center",
	"bg-input-contrast/5 text-input-contrast",
	"hover:bg-accent hover:text-accent-contrast",
	"disabled:pointer-events-none disabled:opacity-30",
	"transition-colors duration-200",
);

type NumberInputProps = {
	input?: {
		name?: string;
		value?: string | number | null;
		onChange?: (value: number | null) => void;
		onBlur?: (value: number | null) => void;
		[key: string]: unknown;
	};
	meta?: {
		error?: string;
		invalid?: boolean;
		touched?: boolean;
	};
	label?: string | null;
	fieldLabel?: string | null;
	placeholder?: string;
	className?: string;
	autoFocus?: boolean;
	hidden?: boolean;
	disabled?: boolean;
	readOnly?: boolean;
	required?: boolean;
	hint?: ReactNode;
	validation?: Record<string, unknown>;
};

const toInt = (value: string): number | null => {
	const int = Number.parseInt(value, 10);
	if (Number.isNaN(int)) {
		return null;
	}
	return int;
};

const NumberInput = ({
	input = {},
	meta = {},
	label = null,
	fieldLabel = null,
	placeholder = "Enter a number...",
	className,
	autoFocus: _autoFocus = false,
	hidden = false,
	disabled = false,
	readOnly = false,
	required = false,
	hint,
	validation: _validation,
}: NumberInputProps) => {
	const { name, value, onChange, onBlur, ...restInput } = input;
	const { error, invalid, touched } = meta;
	const idRef = useRef(uuid());
	const id = idRef.current;
	const inputRef = useRef<HTMLInputElement>(null);

	const state = getInputState({ disabled, readOnly, meta });
	const showErrors = Boolean(touched && invalid && error);
	const errors = useMemo(() => (error ? [error] : []), [error]);
	const isInteractive = !disabled && !readOnly;

	const describedBy =
		[hint ? `${id}-hint` : null, showErrors ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;

	const anyLabel = fieldLabel ?? label ?? undefined;

	const handleChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			onChange?.(toInt(e.target.value));
		},
		[onChange],
	);

	const handleBlur = useCallback(
		(e: React.FocusEvent<HTMLInputElement>) => {
			onBlur?.(toInt(e.target.value));
		},
		[onBlur],
	);

	const handleStep = useCallback(
		(direction: "up" | "down") => {
			const node = inputRef.current;
			if (!node) return;
			if (direction === "up") {
				node.stepUp();
			} else {
				node.stepDown();
			}
			onChange?.(toInt(node.value));
		},
		[onChange],
	);

	return (
		<BaseField
			id={id}
			name={name}
			label={anyLabel ?? undefined}
			hint={hint}
			required={required}
			errors={errors}
			showErrors={showErrors}
			containerProps={hidden ? { hidden: true } : undefined}
		>
			<div className={cx(inputWrapperVariants({ state }), className)}>
				<button
					type="button"
					className={stepperButtonVariants}
					onClick={() => handleStep("down")}
					disabled={!isInteractive}
					aria-label="Decrease value"
					tabIndex={-1}
				>
					<Minus />
				</button>
				<div className={cx("flex min-w-0 grow items-center", inlineSpacingVariants(), wrapperPaddingVariants())}>
					<input
						{...restInput}
						ref={inputRef}
						id={id}
						name={name}
						type="number"
						value={value?.toString() ?? ""}
						placeholder={placeholder}
						disabled={disabled}
						readOnly={readOnly}
						aria-required={required || undefined}
						aria-invalid={showErrors || undefined}
						aria-describedby={describedBy}
						className={inputVariants()}
						onChange={handleChange}
						onBlur={handleBlur}
						onWheel={(e) => e.currentTarget.blur()}
					/>
				</div>
				<button
					type="button"
					className={stepperButtonVariants}
					onClick={() => handleStep("up")}
					disabled={!isInteractive}
					aria-label="Increase value"
					tabIndex={-1}
				>
					<Plus />
				</button>
			</div>
		</BaseField>
	);
};

export default memo(NumberInput);
