import cx from "classnames";
import { memo, useRef, useState } from "react";
import { v4 as uuid } from "uuid";
import Icon from "../Icon";
import MarkdownLabel from "./MarkdownLabel";

interface TextInputProps {
	input?: {
		name?: string;
		value?: any;
		onChange?: (value: any) => void;
		onBlur?: (...args: any[]) => void;
		onFocus?: (...args: any[]) => void;
		[key: string]: any;
	};
	meta?: {
		error?: string;
		invalid?: boolean;
		touched?: boolean;
	};
	label?: string | null;
	placeholder?: string | number;
	fieldLabel?: string | null;
	className?: string;
	type?: "text" | "number" | "search";
	autoFocus?: boolean;
	hidden?: boolean;
	adornmentLeft?: React.ReactNode;
	adornmentRight?: React.ReactNode;
}

const TextInput = ({
	input = {},
	meta = {},
	label = null,
	placeholder = "Enter some text...",
	fieldLabel = null,
	className = "",
	type = "text",
	autoFocus = false,
	hidden = false,
	adornmentLeft = null,
	adornmentRight = null,
}: TextInputProps) => {
	const { error, invalid, touched } = meta;
	const id = useRef(uuid());
	const [hasFocus, setFocus] = useState(false);

	const handleFocus = (...args: any[]) => {
		setFocus(true);
		if (input.onFocus) {
			input.onFocus(...args);
		}
	};

	const handleBlur = (...args: any[]) => {
		setFocus(false);
		if (input.onBlur) {
			input.onBlur(...args);
		}
	};

	const hasLeftAdornment = !!adornmentLeft;
	const hasRightAdornment = !!adornmentRight;
	const hasAdornment = hasLeftAdornment || hasRightAdornment;

	const seamlessClasses = cx(className, "form-field-text", {
		"form-field-text--has-focus": hasFocus,
		"form-field-text--has-error": invalid && touched && error,
		"form-field-text--adornment": hasAdornment,
		"form-field-text--has-left-adornment": hasLeftAdornment,
		"form-field-text--has-right-adornment": hasRightAdornment,
	});

	const anyLabel = fieldLabel || label;

	return (
		<div className="form-field-container" hidden={hidden}>
			{anyLabel && <MarkdownLabel label={anyLabel} />}
			<div className={seamlessClasses}>
				<input
					id={id.current}
					name={input.name}
					className="form-field form-field-text__input"
					placeholder={placeholder} // eslint-disable-line
					type={type}
					// eslint-disable-next-line react/jsx-props-no-spreading
					{...input}
					onBlur={handleBlur}
					onFocus={handleFocus}
				/>
				{adornmentLeft && <div className="form-field-text__adornment-left">{adornmentLeft}</div>}
				{adornmentRight && <div className="form-field-text__adornment-right">{adornmentRight}</div>}
				{invalid && touched && (
					<div className="form-field-text__error">
						<Icon name="warning" />
						{error}
					</div>
				)}
			</div>
		</div>
	);
};

export default memo(TextInput);
