import { type ReactNode, useCallback, useMemo, useRef } from "react";
import { v4 as uuid } from "uuid";
import { BaseField } from "~/components/Form/BaseField";
import { groupSpacingVariants, orientationVariants } from "~/styles/shared/controlVariants";
import { compose, cva } from "~/utils/cva";
import { getInputState } from "~/utils/getInputState";
import type { CheckboxProps } from "./Checkbox";
import Checkbox from "./Checkbox";
import type { Option } from "./utils/options";
import { asOptionObject, getValue } from "./utils/options";

const groupVariants = compose(groupSpacingVariants, orientationVariants, cva({ base: "" }));

type CheckboxGroupProps = {
	options?: Option[];
	className?: string | null;
	label?: string | null;
	fieldLabel?: string | null;
	hint?: ReactNode;
	required?: boolean;
	disabled?: boolean;
	orientation?: "horizontal" | "vertical";
	useColumns?: boolean;
	size?: "sm" | "md" | "lg" | "xl";
	input: {
		name: string;
		value?: unknown[];
		onChange: (value: unknown[]) => void;
	};
	optionComponent?: React.ComponentType<CheckboxProps>;
	meta?: {
		error?: string;
		invalid?: boolean;
		touched?: boolean;
	};
};

const CheckboxGroup = ({
	options = [],
	className,
	label = null,
	fieldLabel = null,
	hint,
	required = false,
	disabled = false,
	orientation = "vertical",
	useColumns = false,
	size = "md",
	input,
	optionComponent = Checkbox,
	meta = {},
}: CheckboxGroupProps) => {
	const idRef = useRef(uuid());
	const id = idRef.current;
	const { value = [] } = input;

	const handleClickOption = useCallback(
		(index: number) => {
			const option = options[index];
			if (!option) return;
			const optionValue = getValue(option);
			const isChecked = value.includes(optionValue);
			const newValue = isChecked ? value.filter((val) => val !== optionValue) : [...value, optionValue];

			input.onChange(newValue);
		},
		[options, value, input],
	);

	const isOptionChecked = useCallback(
		(option: unknown) => {
			return value.includes(option);
		},
		[value],
	);

	const { error, invalid, touched } = meta;
	const showErrors = Boolean(touched && invalid && error);
	const errors = useMemo(() => (error ? [error] : []), [error]);
	const state = getInputState({ disabled, meta });
	const describedBy =
		[hint ? `${id}-hint` : null, showErrors ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;

	const anyLabel = fieldLabel ?? label ?? undefined;

	const renderOption = useCallback(
		(option: Option, index: number) => {
			const OptionComponent = optionComponent;
			const { value: optionValue, label: optionLabel, ...optionRest } = asOptionObject(option);

			return (
				<OptionComponent
					key={index}
					input={{
						name: `${input.name}-${index}`,
						value: index,
						checked: isOptionChecked(optionValue),
						onChange: () => handleClickOption(index),
					}}
					label={optionLabel}
					disabled={disabled}
					{...optionRest}
				/>
			);
		},
		[optionComponent, isOptionChecked, handleClickOption, input.name, disabled],
	);

	return (
		<BaseField
			id={id}
			name={input.name}
			label={anyLabel}
			hint={hint}
			required={required}
			errors={errors}
			showErrors={showErrors}
		>
			<fieldset
				aria-labelledby={anyLabel ? `${id}-label` : undefined}
				aria-invalid={showErrors || undefined}
				aria-describedby={describedBy}
				className={groupVariants({ size, orientation, useColumns, className })}
				data-state={state}
				disabled={disabled}
			>
				{options.map(renderOption)}
			</fieldset>
		</BaseField>
	);
};

export default CheckboxGroup;
