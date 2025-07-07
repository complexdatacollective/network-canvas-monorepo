/* eslint-disable react/jsx-props-no-spreading */

import cx from "classnames";
import { useRef } from "react";
import { v4 as uuid } from "uuid";
import Icon from "~/lib/legacy-ui/components/Icon";
import MarkdownLabel from "./MarkdownLabel";

type TextAreaProps = {
	input?: {
		name?: string;
		value?: string;
		onChange?: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
		[key: string]: unknown;
	};
	meta?: {
		active?: boolean;
		error?: string;
		invalid?: boolean;
		touched?: boolean;
	};
	label?: string | null;
	fieldLabel?: string | null;
	className?: string;
	placeholder?: string;
	hidden?: boolean;
};

const TextArea = ({
	input = {},
	meta = {},
	label = null,
	fieldLabel = null,
	className = "",
	placeholder = "",
	hidden = false,
}: TextAreaProps) => {
	const id = useRef(uuid());

	const { active, error, invalid, touched } = meta;

	const seamlessClasses = cx(className, "form-field-text", {
		"form-field-text--has-focus": active,
		"form-field-text--has-error": invalid && touched && error,
	});

	return (
		<label htmlFor={id.current} className="form-field-container" hidden={hidden}>
			{(fieldLabel || label) && <MarkdownLabel label={fieldLabel || label || ""} />}
			<div className={seamlessClasses}>
				<textarea
					id={id.current}
					className="form-field form-field-text form-field-text--area form-field-text__input"
					placeholder={placeholder}
					{...input}
				/>
				{invalid && touched && (
					<div className="form-field-text__error">
						<Icon name="warning" />
						{error}
					</div>
				)}
			</div>
		</label>
	);
};

export default TextArea;
