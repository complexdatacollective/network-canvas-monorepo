/* eslint-disable react/jsx-props-no-spreading */

import { memo, useRef } from "react";
import { v4 as uuid } from "uuid";
import { cx } from "~/utils/cva";
import MarkdownLabel from "./MarkdownLabel";

export type CheckboxProps = {
	label?: React.ReactNode;
	fieldLabel?: string;
	className?: string;
	disabled?: boolean;
	input: {
		name: string;
		value: unknown;
		onChange: (value: unknown) => void;
		[key: string]: unknown;
	};
	[key: string]: unknown;
};

const Checkbox = ({ label, className = "", input, disabled = false, fieldLabel, ...rest }: CheckboxProps) => {
	const id = useRef(uuid());

	const { name, value, onChange, ...inputRest } = input;

	return (
		<label
			data-disabled={disabled || undefined}
			htmlFor={id.current}
			className={cx(
				"group relative inline-flex cursor-pointer items-center mb-(--space-md) last:mb-0",
				"data-[disabled]:cursor-default data-[disabled]:pointer-events-none",
				className,
			)}
		>
			<input
				id={id.current}
				name={name}
				// input.checked is only provided by redux form if type="checkbox" or type="radio" is
				// provided to <Field />, so for the case that it isn't we can rely on the more reliable
				// input.value
				checked={!!value}
				onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.checked)}
				className="peer absolute opacity-0"
				{...(inputRest as Record<string, unknown>)}
				{...(rest as Record<string, unknown>)}
				type="checkbox"
			/>
			<div
				className={cx(
					"relative inline-flex shrink-0 size-(--space-md) mr-(--space-sm)",
					"before:content-[''] before:absolute before:inset-0 before:border-2 before:border-solid before:border-border",
					"before:transition-[border-color] before:duration-(--animation-duration-standard) before:ease-(--animation-easing)",
					"after:content-[''] after:absolute after:inset-[calc(var(--global-input-border-size)+var(--global-input-border-space))]",
					"after:bg-active after:opacity-0",
					"after:transition-opacity after:duration-(--animation-duration-standard) after:ease-(--animation-easing)",
					"group-hover:before:border-focus",
					"peer-checked:before:border-border peer-checked:after:opacity-100",
					"group-data-[disabled]:before:border-charcoal group-data-[disabled]:after:opacity-0",
				)}
			/>
			{label && <MarkdownLabel inline label={label} className="form-field-inline-label" />}
		</label>
	);
};

const areEqual = (prevProps: CheckboxProps, nextProps: CheckboxProps) => {
	const {
		input: { value: prevValue },
		...prevRest
	} = prevProps;
	const {
		input: { value: nextValue },
		...nextRest
	} = nextProps;

	return prevValue === nextValue && prevRest === nextRest;
};

export default memo(Checkbox, areEqual);
