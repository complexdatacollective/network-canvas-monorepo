/* eslint-disable react/jsx-props-no-spreading */

import cx from "classnames";
import { useCallback } from "react";
import Icon from "~/lib/legacy-ui/components/Icon";
import MarkdownLabel from "./MarkdownLabel";
import ToggleButton from "./ToggleButton";
import { asOptionObject, getValue } from "./utils/options";

interface ToggleButtonGroupProps {
	options?: unknown[];
	className?: string | null;
	label?: string | null;
	fieldLabel?: string | null;
	input: {
		value?: unknown[];
		name: string;
		onChange: (value: unknown[]) => void;
	};
	meta?: {
		error?: string;
		invalid?: boolean;
		touched?: boolean;
	};
}

const ToggleButtonGroup = ({
	options = [],
	className = null,
	label = null,
	fieldLabel = null,
	input,
	meta = {},
}: ToggleButtonGroupProps) => {
	const { value = [] } = input;

	const handleClickOption = useCallback(
		(event: React.ChangeEvent<HTMLInputElement>) => {
			const option = getValue(options[Number.parseInt(event.target.value, 10)]);
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
			const { value: optionValue, label: optionLabel } = asOptionObject(option);

			return (
				<ToggleButton
					className="form-field-togglebutton-group__option"
					key={index}
					input={{
						value: index,
						checked: isOptionChecked(optionValue),
						onChange: handleClickOption,
					}}
					label={optionLabel}
					color={`cat-color-seq-${index}`}
				/>
			);
		},
		[isOptionChecked, handleClickOption],
	);

	const { error, invalid, touched } = meta;
	const classNames = cx("form-field-togglebutton-group", "form-field-container", className, {
		"form-field-togglebutton-group--has-error": invalid && touched && error,
	});

	const anyLabel = fieldLabel || label;

	return (
		<div className={classNames}>
			{anyLabel && <MarkdownLabel label={anyLabel} />}
			<div className="form-field form-field__inline" name={input.name}>
				{options.map(renderOption)}
			</div>
			{invalid && touched && (
				<div className="form-field-togglebutton-group__error">
					<Icon name="warning" />
					{error}
				</div>
			)}
		</div>
	);
};

export default ToggleButtonGroup;
