import { isBoolean } from "es-toolkit/compat";
import { useEffect, useMemo, useRef } from "react";
import { v4 as uuid } from "uuid";
import { BaseField } from "~/components/Form/BaseField";
import { controlVariants, smallSizeVariants } from "~/styles/shared/controlVariants";
import { compose, cva, cx } from "~/utils/cva";
import { getInputState } from "~/utils/getInputState";

const toggleTrackVariants = compose(
	controlVariants,
	smallSizeVariants,
	cva({
		base: cx(
			"relative inline-flex aspect-2/1 items-center rounded-full p-[0.2em]",
			"inset-surface border-0",
			"focusable-within outline-(--input-border)",
			"transition-colors duration-200",
			"cursor-pointer",
		),
		variants: {
			checked: {
				true: "",
				false: "",
			},
			state: {
				normal: "",
				disabled: "cursor-not-allowed opacity-50",
				readOnly: "cursor-default",
				invalid: "",
			},
		},
		compoundVariants: [
			{ checked: false, state: "normal", class: "bg-input-contrast/30" },
			{ checked: true, state: "normal", class: "bg-success" },
			{ checked: false, state: "disabled", class: "bg-input-contrast/10" },
			{ checked: true, state: "disabled", class: "bg-input-contrast/30" },
			{ checked: false, state: "readOnly", class: "bg-input-contrast/20" },
			{ checked: true, state: "readOnly", class: "bg-input-contrast/50" },
			{ checked: false, state: "invalid", class: "bg-input-contrast/30 outline-destructive outline-2" },
			{ checked: true, state: "invalid", class: "bg-current outline-destructive outline-2" },
		],
		defaultVariants: {
			checked: false,
			state: "normal",
		},
	}),
);

const toggleThumbVariants = cva({
	base: cx("pointer-events-none block aspect-square h-full rounded-full shadow-sm", "transition-colors duration-200"),
	variants: {
		state: {
			normal: "bg-input",
			disabled: "bg-input-contrast/30",
			readOnly: "bg-input-contrast/40",
			invalid: "bg-input",
		},
	},
	defaultVariants: {
		state: "normal",
	},
});

type ToggleProps = {
	label?: string | null;
	title?: string;
	fieldLabel?: string | null;
	className?: string;
	disabled?: boolean;
	readOnly?: boolean;
	required?: boolean;
	hint?: React.ReactNode;
	size?: "sm" | "md" | "lg" | "xl";
	input: {
		name?: string;
		value?: unknown;
		onChange: (value: boolean) => void;
		[key: string]: unknown;
	};
	meta?: {
		error?: string;
		invalid?: boolean;
		touched?: boolean;
	};
};

const Toggle = ({
	label = null,
	title = "",
	fieldLabel = null,
	className = "",
	disabled = false,
	readOnly = false,
	required = false,
	hint,
	size = "md",
	input,
	meta = {},
}: ToggleProps) => {
	const idRef = useRef(uuid());
	const id = idRef.current;

	// Redux form doesn't submit untouched fields, so coerce undefined to false
	// on mount to ensure the store always has a boolean for this field.
	useEffect(() => {
		if (!isBoolean(input.value)) {
			input.onChange(false);
		}
	}, [input]);

	const { error, invalid, touched } = meta;
	const showErrors = Boolean(touched && invalid && error);
	const errors = useMemo(() => (error ? [error] : []), [error]);
	const state = getInputState({ disabled, readOnly, meta });
	const checked = !!input.value;

	const describedBy =
		[hint ? `${id}-hint` : null, showErrors ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;

	const anyLabel = fieldLabel ?? label ?? undefined;

	const { name, value: _value, onChange, ...inputRest } = input;

	return (
		<BaseField
			id={id}
			name={name}
			label={anyLabel ?? undefined}
			hint={hint}
			required={required}
			errors={errors}
			showErrors={showErrors}
		>
			<label
				className={cx(
					toggleTrackVariants({ checked, state, size, className }),
					checked ? "justify-end" : "justify-start",
				)}
				htmlFor={id}
				title={title}
			>
				<input
					id={id}
					name={name}
					type="checkbox"
					role="switch"
					checked={checked}
					aria-checked={checked}
					onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.checked)}
					disabled={disabled}
					readOnly={readOnly}
					aria-required={required || undefined}
					aria-invalid={showErrors || undefined}
					aria-describedby={describedBy}
					className="sr-only"
					{...(inputRest as Record<string, unknown>)}
				/>
				<span aria-hidden className={toggleThumbVariants({ state })} />
			</label>
		</BaseField>
	);
};

export default Toggle;
