/* eslint-disable react/jsx-props-no-spreading */

import cx from "classnames";
import { useRef } from "react";
import { v4 as uuid } from "uuid";
import MarkdownLabel from "./MarkdownLabel";

type RadioProps = {
	label?: React.ReactNode;
	fieldLabel?: string;
	className?: string;
	disabled?: boolean;
	input: {
		name?: string;
		value?: unknown;
		onChange?: (value: unknown) => void;
		[key: string]: unknown;
	};
} & Record<string, unknown>;

const Radio = ({ label, className = "", input, disabled = false, fieldLabel, ...rest }: RadioProps) => {
	const id = useRef(uuid());

	const componentClasses = cx("form-field-radio", className, {
		"form-field-radio--disabled": disabled,
	});

	const { name, value, onChange, ...inputRest } = input;

	return (
		<label className={componentClasses} htmlFor={id.current}>
			<input
				type="radio"
				className="form-field-radio__input"
				id={id.current}
				name={name}
				// input.checked is only provided by redux form if type="checkbox" or type="radio" is
				// provided to <Field />, so for the case that it isn't we can rely on the more reliable
				// input.value
				checked={!!value}
				onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange?.(e.target.checked)}
				{...(inputRest as Record<string, unknown>)}
				{...(rest as Record<string, unknown>)}
			/>
			<div className="form-field-radio__radio" />
			{label &&
				(typeof label === "string" ? (
					<MarkdownLabel inline label={label} className="form-field-inline-label" />
				) : (
					<div className="w-12 h-12">{label}</div>
				))}
		</label>
	);
};

export default Radio;
