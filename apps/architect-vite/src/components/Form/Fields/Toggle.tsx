/* eslint-disable react/jsx-props-no-spreading */

import cx from "classnames";
import { isBoolean } from "lodash";
import { useEffect, useRef } from "react";
import { v4 as uuid } from "uuid";
import Icon from "~/lib/legacy-ui/components/Icon";
import MarkdownLabel from "./MarkdownLabel";

type ToggleProps = {
	label?: string | null;
	title?: string;
	fieldLabel?: string | null;
	className?: string;
	disabled?: boolean;
	input: {
		name?: string;
		value?: unknown;
		onChange: (value: boolean) => void;
		[key: string]: unknown;
	};
	meta?: {
		error?: string;
		invalid?: boolean;
		touched?: boolean;
	};
	[key: string]: unknown;
};

const Toggle = ({
	label = null,
	title = "",
	fieldLabel = null,
	className = "",
	disabled = false,
	input,
	meta = {},
	...rest
}: ToggleProps) => {
	const id = useRef(uuid());

	// Because redux forms will just not pass on this
	// field if it was never touched and we need it to
	// return `false`.
	useEffect(() => {
		if (!isBoolean(input.value)) {
			input.onChange(false);
		}
	}, [input]);

	const { error, invalid, touched } = meta;

	const containerClassNames = cx("form-field-container", {
		"form-field-toggle--has-error": invalid && touched && error,
	});

	const componentClasses = cx("form-field", "form-field-toggle", className, {
		"form-field-toggle--disabled": disabled,
		"form-field-toggle--has-error": invalid && touched && error,
	});

	const { name, value, onChange, ...inputRest } = input;

	return (
		<div className={containerClassNames}>
			{fieldLabel && <MarkdownLabel label={fieldLabel} />}
			<label className={componentClasses} htmlFor={id.current} title={title}>
				<input
					className="form-field-toggle__input"
					id={id.current}
					name={name}
					checked={!!value}
					onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.checked)}
					disabled={disabled}
					type="checkbox"
					value="true"
					{...(inputRest as Record<string, unknown>)}
					{...(rest as Record<string, unknown>)}
				/>
				<div className="form-field-toggle__toggle">
					<span className="form-field-toggle__button" />
				</div>
				{label && <MarkdownLabel inline label={label} className="form-field-inline-label" />}
			</label>
			{invalid && touched && (
				<div className="form-field-toggle__error">
					<Icon name="warning" />
					{error}
				</div>
			)}
		</div>
	);
};

export default Toggle;
