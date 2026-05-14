/* eslint-disable react/jsx-props-no-spreading */

import { useCallback, useRef } from "react";
import { v4 as uuid } from "uuid";
import Icon from "~/lib/legacy-ui/components/Icon";
import { cx } from "~/utils/cva";
import MarkdownLabel from "./MarkdownLabel";
import Radio from "./Radio";
import type { Option } from "./utils/options";
import { asOptionObject, getValue } from "./utils/options";

type RadioGroupProps = {
	options?: Option[];
	label?: string | null;
	input: {
		value: unknown;
		name: string;
		onChange: (value: unknown) => void;
	};
	className?: string | null;
	fieldLabel?: string | null;
	meta?: {
		error?: string;
		invalid?: boolean;
		touched?: boolean;
	};
	optionComponent?: React.ComponentType<{
		input: {
			value: unknown;
			checked?: boolean;
			onChange: () => void;
		};
		label: string;
		[key: string]: unknown;
	}>;
};

const RadioGroup = ({
	options = [],
	label = null,
	input,
	className = null,
	fieldLabel = null,
	meta = {},
	optionComponent: OptionComponent = Radio,
}: RadioGroupProps) => {
	const _id = useRef(uuid());

	const onChange = useCallback(
		(index: number) => {
			const option = options[index];
			if (option) {
				input.onChange(getValue(option));
			}
		},
		[input, options],
	);

	const renderOption = useCallback(
		(option: Option, index: number) => {
			const { value: optionValue, label: optionLabel, ...optionRest } = asOptionObject(option);
			const selected = optionValue === input.value;

			return (
				<OptionComponent
					key={index}
					input={{
						value: index,
						checked: selected,
						onChange: () => onChange(index),
					}}
					label={optionLabel}
					{...optionRest}
				/>
			);
		},
		[input.value, onChange, OptionComponent],
	);

	const { error, invalid, touched } = meta;
	const hasError = !!(invalid && touched && error);

	const anyLabel = fieldLabel || label;

	return (
		<div className="form-field-container">
			{anyLabel && <MarkdownLabel label={anyLabel} />}
			<div className={cx("form-field flex flex-col", hasError && "border-2 border-error mb-0", className)}>
				{options.map(renderOption)}
			</div>
			{hasError && (
				<div className="flex items-center bg-error text-foreground py-(--space-sm) px-(--space-xs) [&_svg]:max-h-(--space-md)">
					<Icon name="warning" />
					{error}
				</div>
			)}
		</div>
	);
};

export default RadioGroup;
