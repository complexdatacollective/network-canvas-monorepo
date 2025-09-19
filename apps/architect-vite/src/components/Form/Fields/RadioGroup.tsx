/* eslint-disable react/jsx-props-no-spreading */

import cx from "classnames";
import { useCallback, useRef } from "react";
import { v4 as uuid } from "uuid";
import Icon from "~/lib/legacy-ui/components/Icon";
import MarkdownLabel from "./MarkdownLabel";
import Radio from "./Radio";
import { asOptionObject, getValue } from "./utils/options";

interface RadioGroupProps {
	options?: unknown[];
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
	optionComponent?: React.ComponentType<unknown>;
}

const RadioGroup = ({
	options = [],
	label = null,
	input,
	className = null,
	fieldLabel = null,
	meta = {},
	optionComponent: OptionComponent = Radio,
}: RadioGroupProps) => {
	const id = useRef(uuid());

	const onChange = useCallback(
		(index: number) => {
			input.onChange(getValue(options[index]));
		},
		[input, options],
	);

	const renderOption = useCallback(
		(option: unknown, index: number) => {
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

	const containerClassNames = cx("form-field-container", {
		"form-field-radio-group--has-error": invalid && touched && error,
	});

	const classNames = cx("form-field", "form-field-radio-group", className);

	const anyLabel = fieldLabel || label;

	return (
		<div className={containerClassNames}>
			{anyLabel && <MarkdownLabel label={anyLabel} />}
			<div className={classNames} name={input.name}>
				{options.map(renderOption)}
			</div>
			{invalid && touched && (
				<div className="form-field-radio-group__error">
					<Icon name="warning" />
					{error}
				</div>
			)}
		</div>
	);
};

export { RadioGroup };
export default RadioGroup;
