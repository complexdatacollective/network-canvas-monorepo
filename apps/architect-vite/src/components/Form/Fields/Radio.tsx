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
		value?: any;
		onChange?: (value: any) => void;
		[key: string]: any;
	};
} & Record<string, any>;

const Radio = ({ label = null, className = "", input, disabled = false, fieldLabel = null, ...rest }: RadioProps) => {
	const id = useRef(uuid());

	const componentClasses = cx("form-field-radio", className, {
		"form-field-radio--disabled": disabled,
	});

	return (
		<label className={componentClasses} htmlFor={id.current}>
			<input
				type="radio"
				className="form-field-radio__input"
				id={id.current}
				// input.checked is only provided by redux form if type="checkbox" or type="radio" is
				// provided to <Field />, so for the case that it isn't we can rely on the more reliable
				// input.value
				checked={!!input.value}
				{...input}
				{...rest}
			/>
			<div className="form-field-radio__radio" />
			{label && <MarkdownLabel inline label={label} className="form-field-inline-label" />}
		</label>
	);
};

export default Radio;
