/* eslint-disable react/jsx-props-no-spreading */

import cx from "classnames";
import { useCallback } from "react";
import Icon from "~/lib/legacy-ui/components/Icon";
import Checkbox from "./Checkbox";
import MarkdownLabel from "./MarkdownLabel";
import type { Option } from "./utils/options";
import { asOptionObject, getValue } from "./utils/options";

type CheckboxGroupProps = {
	options?: Option[];
	className?: string | null;
	label?: string | null;
	fieldLabel?: string | null;
	input: {
		name: string;
		value?: unknown[];
		onChange: (value: unknown[]) => void;
	};
	optionComponent?: React.ComponentType<{
		className?: string;
		input: {
			value: unknown;
			checked?: boolean;
			onChange: () => void;
		};
		label: string;
		[key: string]: unknown;
	}>;
	meta?: {
		error?: string;
		invalid?: boolean;
		touched?: boolean;
	};
};

const CheckboxGroup = ({
	options = [],
	className = null,
	label = null,
	fieldLabel = null,
	input,
	optionComponent = Checkbox,
	meta = {},
}: CheckboxGroupProps) => {
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

	const renderOption = useCallback(
		(option: Option, index: number) => {
			const OptionComponent = optionComponent;
			const { value: optionValue, label: optionLabel, ...optionRest } = asOptionObject(option);

			return (
				<OptionComponent
					className="form-field-checkbox-group__option"
					key={index}
					input={{
						value: index,
						checked: isOptionChecked(optionValue),
						onChange: () => handleClickOption(index),
					}}
					label={optionLabel}
					{...optionRest}
				/>
			);
		},
		[optionComponent, isOptionChecked, handleClickOption],
	);

	const { error, invalid, touched } = meta;
	const classNames = cx(
		"form-field-checkbox-group",
		"form-field-container",
		{
			"form-field-checkbox-group--has-error": invalid && touched && error,
		},
		className,
	);

	const anyLabel = fieldLabel || label;

	return (
		<div className={classNames}>
			{anyLabel && <MarkdownLabel label={anyLabel} />}
			<div className="form-field">{options.map(renderOption)}</div>
			{invalid && touched && (
				<div className="form-field-checkbox-group__error">
					<Icon name="warning" />
					{error}
				</div>
			)}
		</div>
	);
};

export default CheckboxGroup;
