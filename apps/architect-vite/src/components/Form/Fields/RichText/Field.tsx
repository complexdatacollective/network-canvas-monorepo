import cx from "classnames";
import { useRef } from "react";
import { v4 as uuid } from "uuid";
import Icon from "~/lib/legacy-ui/components/Icon";
import MarkdownLabel from "~/components/Form/Fields/MarkdownLabel";
import RichText from "./RichText";

interface RichTextFieldProps {
	input: {
		value: string;
		onChange: (value: string) => void;
		onFocus?: () => void;
		onBlur?: () => void;
	};
	meta?: {
		error?: string;
		active?: boolean;
		invalid?: boolean;
		touched?: boolean;
	};
	label?: string | null;
	placeholder?: string;
	autoFocus?: boolean;
	inline?: boolean;
	disallowedTypes?: string[];
	className?: string | null;
}

const RichTextField = ({
	input,
	meta = {},
	label = null,
	placeholder,
	autoFocus = false,
	inline = false,
	disallowedTypes = [],
	className = null,
}: RichTextFieldProps) => {
	const id = useRef(uuid());

	const anyLabel = label;

	const seamlessClasses = cx(className, "form-field-rich-text", {
		"form-field-rich-text--has-focus": meta.active,
		"form-field-rich-text--has-error": meta.invalid && meta.touched && meta.error,
	});

	return (
		<div className="form-field-container">
			{anyLabel && <MarkdownLabel label={anyLabel} />}
			<div className={seamlessClasses}>
				<RichText
					value={input.value}
					onChange={input.onChange}
					placeholder={placeholder}
					autoFocus={autoFocus}
					inline={inline}
					disallowedTypes={disallowedTypes}
				/>
				{meta.invalid && meta.touched && (
					<div className="form-field-rich-text__error">
						<Icon name="warning" />
						{meta.error}
					</div>
				)}
			</div>
		</div>
	);
};

export default RichTextField;
