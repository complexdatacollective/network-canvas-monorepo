/* eslint-disable react/jsx-props-no-spreading */

import cx from "classnames";
import { memo, useRef } from "react";
import { v4 as uuid } from "uuid";
import MarkdownLabel from "./MarkdownLabel";

interface CheckboxProps {
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
}

const Checkbox = ({
	label,
	className = "",
	input,
	disabled = false,
	fieldLabel,
	...rest
}: CheckboxProps) => {
	const id = useRef(uuid());

	const componentClasses = cx("form-field-checkbox", className, {
		"form-field-checkbox--disabled": disabled,
	});

	const { name, value, onChange, ...inputRest } = input;

	return (
		<label className={componentClasses} htmlFor={id.current}>
			<input
				className="form-field-checkbox__input"
				id={id.current}
				name={name}
				// input.checked is only provided by redux form if type="checkbox" or type="radio" is
				// provided to <Field />, so for the case that it isn't we can rely on the more reliable
				// input.value
				checked={!!value}
				onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.checked)}
				{...(inputRest as Record<string, unknown>)}
				{...(rest as Record<string, unknown>)}
				type="checkbox"
			/>
			<div className="form-field-checkbox__checkbox" />
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
