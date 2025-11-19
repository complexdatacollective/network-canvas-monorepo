/* eslint-disable react/jsx-props-no-spreading */

import cx from "classnames";
import { useCallback } from "react";
import Icon from "~/lib/legacy-ui/components/Icon";
import Checkbox from "./Checkbox";
import MarkdownLabel from "./MarkdownLabel";
import { asOptionObject, getValue } from "./utils/options";

interface CheckboxGroupProps {
	options?: unknown[];
	className?: string | null;
	label?: string | null;
	fieldLabel?: string | null;
	input: {
		name: string;
		value?: unknown[];
		onChange: (value: unknown[]) => void;
	};
	optionComponent?: React.ComponentType<unknown>;
	meta?: {
		error?: string;
		invalid?: boolean;
		touched?: boolean;
	};
}

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
			const option = getValue(options[index]);
			const isChecked = value.includes(option);
			const newValue = isChecked ? value.filter((val) => val !== option) : [...value, option];

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
		(option: unknown, index: number) => {
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
			<div className="form-field" name={input.name}>
				{options.map(renderOption)}
			</div>
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
