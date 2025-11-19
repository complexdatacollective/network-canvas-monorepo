import cx from "classnames";
import { useEffect, useRef } from "react";
import { v4 as uuid } from "uuid";
import { Icon } from "~/lib/legacy-ui/components";

const dashIndex = [4, 7];

// - ignore dashes (they are auto-populated)
// - ignore letters
const filterInput = (currentValue: string) => (e: React.KeyboardEvent) => {
	const ignoreList = "abcdefghijklmnopqrstuvwxyz-".split("");
	if (dashIndex.includes(currentValue.length) && e.key === "-") {
		return;
	}
	if (!ignoreList.includes(e.key)) {
		return;
	}
	e.preventDefault();
};

const getParsedValue =
	(dateFormat: string) =>
	(value = "", previousValue = "") => {
		const parsedValue = value
			.split("")
			.slice(0, dateFormat.length)
			.map((char, index) => {
				if (dashIndex.includes(index)) {
					return "-";
				}
				return Number.parseInt(char, 10) || "0";
			})
			.join("");

		if (dashIndex.includes(value.length) && previousValue.length < value.length && value.length < dateFormat.length) {
			return `${parsedValue}-`;
		}

		return parsedValue;
	};

type InputProps = {
	name: string;
	value: string;
	onChange: (value: string) => void;
};

type MetaProps = {
	error?: string;
	active?: boolean;
	invalid?: boolean;
	touched?: boolean;
};

type TextInputProps = {
	input?: InputProps;
	meta?: MetaProps;
	label?: string | null;
	fieldLabel?: string | null;
	className?: string;
	autoFocus?: boolean;
	hidden?: boolean;
	dateFormat?: string;
	placeholder?: string;
};

const TextInput = ({
	input = {} as InputProps,
	meta: { error, active, invalid, touched } = {},
	label = null,
	fieldLabel = null,
	className = "",
	autoFocus: _autoFocus = false,
	hidden = false,
	dateFormat = "YYYY-MM-DD",
}: TextInputProps) => {
	const id = useRef(uuid());

	useEffect(() => {
		const newValue = getParsedValue(dateFormat)(input.value);
		input.onChange(newValue);
	}, [dateFormat, input.onChange, input.value]);

	const seamlessClasses = cx(className, "form-field-text", {
		"form-field-text--has-focus": active,
		"form-field-text--has-error": invalid && touched && error,
	});

	const anyLabel = fieldLabel || label;

	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const newValue = e.target.value;
		const parsedValue = getParsedValue(dateFormat)(newValue, input.value);
		input.onChange(parsedValue);
	};

	return (
		<div className="form-field-container" hidden={hidden}>
			{anyLabel && <h4>{anyLabel}</h4>}
			<div className={seamlessClasses}>
				<input
					id={id.current}
					name={input.name}
					className="form-field form-field-text form-field-text__input"
					placeholder={dateFormat.toUpperCase()} // eslint-disable-line
					// eslint-disable-next-line react/jsx-props-no-spreading
					{...input}
					onKeyDown={filterInput(input.value)}
					onChange={handleChange}
				/>
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

export default TextInput;
