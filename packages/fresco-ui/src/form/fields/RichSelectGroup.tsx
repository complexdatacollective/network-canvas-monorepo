"use client";

import { motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Label } from "../../Label";
import { RenderMarkdown } from "../../RenderMarkdown";
import {
	controlVariants,
	groupSpacingVariants,
	inputControlVariants,
	orientationVariants,
	smallSizeVariants,
	stateVariants,
	textSizeVariants,
} from "../../styles/controlVariants";
import { compose, cva, cx, type VariantProps } from "../../utils/cva";
import type { CreateFormFieldProps } from "../Field/types";
import { getInputState } from "../utils/getInputState";

const richSelectGroupVariants = compose(
	orientationVariants,
	cva({
		base: "",
		variants: {
			size: {
				sm: "gap-2",
				md: "gap-2",
				lg: "gap-3",
				xl: "gap-4",
			},
			orientation: {
				vertical: "items-stretch",
				horizontal: "mx-auto w-fit items-stretch *:min-w-0",
			},
		},
		defaultVariants: {
			size: "md",
			orientation: "vertical",
		},
	}),
);

// Individual option card variants
const optionCardVariants = compose(
	groupSpacingVariants,
	textSizeVariants,
	cva({
		base: cx(
			"grid cursor-pointer grid-cols-[auto_1fr] content-start items-start gap-x-4! gap-y-2!",
			"overflow-hidden rounded border-2 border-current/20",
			"bg-input text-left text-wrap",
			"transition-colors duration-200",
			"focusable",
		),
		variants: {
			selected: {
				true: "border-primary",
				false: "hover:border-current/40",
			},
			state: {
				normal: "",
				disabled: "pointer-events-none cursor-not-allowed opacity-50",
				readOnly: "pointer-events-none cursor-default",
				invalid: "border-destructive",
			},
		},
		compoundVariants: [
			{
				selected: true,
				state: "invalid",
				className: "border-destructive",
			},
			{
				selected: false,
				state: "readOnly",
				className: "opacity-40",
			},
		],
		defaultVariants: {
			selected: false,
			state: "normal",
		},
	}),
);

const indicatorVariants = compose(
	smallSizeVariants,
	controlVariants,
	inputControlVariants,
	stateVariants,
	cva({
		base: cx("flex aspect-square shrink-0 items-center justify-center", "focusable"),
		variants: {
			mode: {
				radio: "rounded-full",
				checkbox: "rounded-[0.15em]",
			},
		},
		defaultVariants: {
			mode: "radio",
		},
	}),
);

const descriptionVariants = cva({
	base: "col-start-2 leading-snug text-pretty text-current/70",
	variants: {
		size: {
			sm: "text-xs",
			md: "text-sm",
			lg: "text-base",
			xl: "text-lg",
		},
	},
	defaultVariants: {
		size: "md",
	},
});

const selectionSpring = {
	type: "spring" as const,
	duration: 0.3,
	bounce: 0.15,
};

export type RichSelectOption = {
	value: string | number;
	label: string;
	description?: string;
	disabled?: boolean;
};

type RichSelectGroupProps = CreateFormFieldProps<
	string | number | (string | number)[],
	"fieldset",
	{
		options: RichSelectOption[];
		multiple?: boolean;
		defaultValue?: string | number | (string | number)[];
		orientation?: "horizontal" | "vertical";
		size?: "sm" | "md" | "lg" | "xl";
		useColumns?: boolean;
		autoFocus?: boolean;
	}
> &
	VariantProps<typeof richSelectGroupVariants>;

export default function RichSelectGroupField(props: RichSelectGroupProps) {
	const {
		id,
		className,
		options = [],
		value,
		defaultValue,
		onChange,
		multiple = false,
		orientation = "vertical",
		size = "md",
		useColumns = false,
		autoFocus = false,
		disabled,
		readOnly,
		...fieldsetProps
	} = props;

	const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

	const isControlled = onChange !== undefined;

	const currentValue = useMemo(
		() => (isControlled ? value : (defaultValue ?? (multiple ? [] : undefined))),
		[isControlled, value, defaultValue, multiple],
	);

	const isSelected = useCallback(
		(optionValue: string | number) => {
			if (multiple && Array.isArray(currentValue)) {
				return currentValue.includes(optionValue);
			}
			return currentValue === optionValue;
		},
		[currentValue, multiple],
	);

	useEffect(() => {
		if (!autoFocus) return;
		const selectedIndex = options.findIndex((opt) => !(disabled ?? opt.disabled) && isSelected(opt.value));
		const firstEnabledIndex = options.findIndex((opt) => !(disabled ?? opt.disabled));
		const targetIndex = selectedIndex >= 0 ? selectedIndex : firstEnabledIndex;
		if (targetIndex >= 0) {
			// preventScroll: avoid browser scroll-into-view fighting parent enter animations
			// (e.g. MotionSurface sliding up from translateY 120%).
			optionRefs.current[targetIndex]?.focus({ preventScroll: true });
		}
		// Focus the listbox only when the field first mounts with autoFocus enabled.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const handleSelect = useCallback(
		(optionValue: string | number) => {
			if (readOnly || !onChange) return;

			if (multiple) {
				const arr = Array.isArray(value) ? value : [];
				const isAlreadySelected = arr.includes(optionValue);
				const newValues = isAlreadySelected ? arr.filter((v) => v !== optionValue) : [...arr, optionValue];
				onChange(newValues);
			} else {
				onChange(optionValue);
			}
		},
		[multiple, onChange, readOnly, value],
	);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent, index: number) => {
			if (multiple) return;

			const enabledIndices = options
				.map((opt, i) => ({ disabled: disabled ?? opt.disabled, index: i }))
				.filter((opt) => !opt.disabled)
				.map((opt) => opt.index);

			const currentEnabledIndex = enabledIndices.indexOf(index);
			if (currentEnabledIndex === -1) return;

			let nextIndex: number | undefined;

			if (e.key === "ArrowDown" || e.key === "ArrowRight") {
				e.preventDefault();
				const next = currentEnabledIndex + 1;
				nextIndex = enabledIndices[next >= enabledIndices.length ? 0 : next];
			} else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
				e.preventDefault();
				const prev = currentEnabledIndex - 1;
				nextIndex = enabledIndices[prev < 0 ? enabledIndices.length - 1 : prev];
			} else if (e.key === "Home") {
				e.preventDefault();
				nextIndex = enabledIndices[0];
			} else if (e.key === "End") {
				e.preventDefault();
				nextIndex = enabledIndices[enabledIndices.length - 1];
			}

			if (nextIndex !== undefined) {
				optionRefs.current[nextIndex]?.focus();
			}
		},
		[multiple, options, disabled],
	);

	const groupState = getInputState(props);
	const isSingle = !multiple;

	return (
		<div className={cx(useColumns && "@container w-full")}>
			{isSingle ? (
				<div
					id={id}
					className={richSelectGroupVariants({
						size,
						orientation,
						useColumns,
						className,
					})}
					role="listbox"
					aria-orientation={orientation}
					aria-label={fieldsetProps["aria-label"]}
					aria-labelledby={fieldsetProps["aria-labelledby"]}
					aria-describedby={fieldsetProps["aria-describedby"]}
					aria-invalid={fieldsetProps["aria-invalid"] ?? undefined}
					aria-disabled={disabled ? true : undefined}
					data-readonly={readOnly ? "true" : undefined}
				>
					{renderOptions()}
				</div>
			) : (
				<fieldset
					id={id}
					{...fieldsetProps}
					className={richSelectGroupVariants({
						size,
						orientation,
						useColumns,
						className,
					})}
					disabled={disabled}
					aria-label={fieldsetProps["aria-label"]}
					aria-labelledby={fieldsetProps["aria-labelledby"]}
					aria-describedby={fieldsetProps["aria-describedby"]}
					aria-invalid={fieldsetProps["aria-invalid"] ?? undefined}
					data-readonly={readOnly ? "true" : undefined}
				>
					{renderOptions()}
				</fieldset>
			)}
		</div>
	);

	function renderOptions() {
		return options.map((option, index) => {
			const isOptionDisabled = disabled ?? option.disabled;
			const optionSelected = isSelected(option.value);
			const optionState = isOptionDisabled
				? "disabled"
				: readOnly
					? "readOnly"
					: groupState === "invalid"
						? "invalid"
						: "normal";

			const ariaProps = isSingle
				? {
						role: "option" as const,
						"aria-selected": optionSelected,
						tabIndex: optionSelected || (!currentValue && index === 0) ? 0 : -1,
					}
				: {
						"aria-pressed": optionSelected,
						tabIndex: 0,
					};

			return (
				<motion.button
					key={String(option.value)}
					ref={(el) => {
						optionRefs.current[index] = el;
					}}
					type="button"
					className={optionCardVariants({
						selected: optionSelected,
						state: optionState,
						size,
					})}
					onClick={() => {
						if (!isOptionDisabled && !readOnly) {
							handleSelect(option.value);
						}
					}}
					onKeyDown={(e) => handleKeyDown(e, index)}
					disabled={isOptionDisabled}
					whileTap={isOptionDisabled || readOnly ? undefined : { scale: 0.98 }}
					transition={selectionSpring}
					{...ariaProps}
				>
					<span
						aria-hidden
						className={indicatorVariants({
							size,
							state: optionState,
							mode: isSingle ? "radio" : "checkbox",
						})}
					>
						{isSingle ? (
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
									animate={{ scale: optionSelected ? 1 : 0 }}
									transition={{
										type: "spring",
										bounce: 0.3,
										duration: optionSelected ? 0.3 : 0.15,
									}}
								/>
							</svg>
						) : (
							<svg
								aria-hidden="true"
								viewBox="0 0 24 24"
								fill="none"
								className="text-primary size-full p-[0.1em]"
								stroke="currentColor"
								strokeWidth="3"
							>
								<path
									d="M4 12L10 18L20 6"
									pathLength={1}
									style={{
										strokeDasharray: 1,
										strokeDashoffset: optionSelected ? 0 : 1,
										strokeLinecap: optionSelected ? "round" : "butt",
										transition: "stroke-dashoffset 0.2s ease-out",
									}}
								/>
							</svg>
						)}
					</span>
					<Label className="m-0!">
						<RenderMarkdown>{option.label}</RenderMarkdown>
					</Label>
					{option.description && (
						<span className={descriptionVariants({ size })}>
							<RenderMarkdown>{option.description}</RenderMarkdown>
						</span>
					)}
				</motion.button>
			);
		});
	}
}
