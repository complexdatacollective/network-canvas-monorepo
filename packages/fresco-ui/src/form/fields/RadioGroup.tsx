"use client";

import { Radio } from "@base-ui/react/radio";
import { RadioGroup, type RadioGroupProps } from "@base-ui/react/radio-group";
import { motion } from "motion/react";
import { useId } from "react";
import { RenderMarkdown } from "../../RenderMarkdown";
import {
	controlLabelVariants,
	controlVariants,
	groupOptionVariants,
	groupSpacingVariants,
	inputControlVariants,
	interactiveStateVariants,
	orientationVariants,
	smallSizeVariants,
	stateVariants,
} from "../../styles/controlVariants";
import { compose, cva, cx, type VariantProps } from "../../utils/cva";
import type { CreateFormFieldProps } from "../Field/types";
import { getInputState } from "../utils/getInputState";

const radioGroupWrapperVariants = compose(
	controlVariants,
	inputControlVariants,
	groupSpacingVariants,
	stateVariants,
	interactiveStateVariants,
	orientationVariants,
	cva({
		base: "items-start",
	}),
);

const radioIndicatorVariants = compose(
	smallSizeVariants,
	controlVariants,
	inputControlVariants,
	stateVariants,
	cva({
		base: cx("flex aspect-square shrink-0! items-center justify-center", "rounded-full", "focusable"),
	}),
);

type RadioItemProps = {
	value: string | number;
	label: string;
	disabled?: boolean;
	readOnly?: boolean;
	size?: VariantProps<typeof radioIndicatorVariants>["size"];
	id?: string;
};

export function RadioItem({ value, label, disabled, readOnly, size = "md", id }: RadioItemProps) {
	const generatedId = useId();
	const optionId = id ?? generatedId;
	const optionValue = String(value);
	const indicatorState = disabled ? "disabled" : readOnly ? "readOnly" : "normal";

	return (
		<label htmlFor={optionId} className={groupOptionVariants({ size, disabled })}>
			<motion.div
				whileTap={disabled ? undefined : { scale: 0.85 }}
				transition={{
					type: "spring",
					duration: 0.3,
					bounce: 0.3,
				}}
				tabIndex={-1}
			>
				<Radio.Root
					value={optionValue}
					disabled={disabled}
					nativeButton
					render={(renderProps, state) => (
						<button
							{...renderProps}
							id={optionId}
							type="button"
							aria-label={label}
							className={radioIndicatorVariants({
								size,
								state: indicatorState,
							})}
						>
							<svg
								aria-hidden="true"
								viewBox="0 0 24 24"
								fill="currentColor"
								className="text-primary size-full overflow-hidden rounded-full p-[0.1em]"
							>
								<motion.circle
									cx="12"
									cy="12"
									r="10"
									initial={false}
									animate={{ scale: state.checked ? 1 : 0 }}
									transition={{
										type: "spring",
										bounce: 0.3,
										duration: state.checked ? 0.3 : 0.15,
									}}
								/>
							</svg>
						</button>
					)}
				/>
			</motion.div>
			<span
				className={cx(
					controlLabelVariants({ size }),
					"cursor-[inherit] transition-colors duration-200",
					disabled && "opacity-50",
				)}
			>
				<RenderMarkdown>{label}</RenderMarkdown>
			</span>
		</label>
	);
}

type RadioOption = {
	value: string | number;
	label: string;
	disabled?: boolean;
};

type RadioGroupFieldProps = CreateFormFieldProps<
	string | number,
	"div",
	Omit<RadioGroupProps, "size" | "onValueChange" | "value" | "defaultValue"> &
		VariantProps<typeof radioGroupWrapperVariants> & {
			options: RadioOption[];
			defaultValue?: string | number;
			orientation?: "horizontal" | "vertical";
			size?: "sm" | "md" | "lg" | "xl";
			useColumns?: boolean;
		}
>;

export default function RadioGroupField(props: RadioGroupFieldProps) {
	const {
		id,
		className,
		name,
		options,
		value,
		defaultValue,
		onChange,
		orientation = "vertical",
		size = "md",
		useColumns = false,
		disabled,
		readOnly,
		...rest
	} = props;

	const handleValueChange = (newValue: unknown) => {
		if (readOnly) return;
		onChange?.(newValue as string | number);
	};

	// Determine if controlled or uncontrolled mode
	// Controlled: onChange prop is provided (form system always uses this pattern)
	// We use onChange as the indicator because the form system may pass undefined
	// value initially while the store is hydrating, but will always provide onChange
	const isControlled = onChange !== undefined;
	// For controlled mode, use empty string as fallback to prevent uncontrolled->controlled switch
	const stringValue = isControlled ? (value !== undefined ? String(value) : "") : undefined;
	const stringDefaultValue = !isControlled && defaultValue !== undefined ? String(defaultValue) : undefined;

	const optionIdPrefix = useId();

	return (
		<div className="@container w-full">
			<RadioGroup
				{...rest}
				id={id}
				name={name}
				{...(isControlled ? { value: stringValue } : { defaultValue: stringDefaultValue })}
				onValueChange={handleValueChange}
				disabled={disabled}
				readOnly={readOnly}
				render={<fieldset />}
				className={radioGroupWrapperVariants({
					size,
					orientation,
					useColumns,
					state: getInputState(props),
					className,
				})}
				aria-label={rest["aria-label"]}
				aria-describedby={rest["aria-describedby"]}
				aria-invalid={rest["aria-invalid"] ?? undefined}
			>
				{options.map((option) => (
					<RadioItem
						key={String(option.value)}
						value={option.value}
						label={option.label}
						disabled={disabled ?? option.disabled}
						readOnly={readOnly}
						size={size}
						id={`${optionIdPrefix}-${String(option.value)}`}
					/>
				))}
			</RadioGroup>
		</div>
	);
}
