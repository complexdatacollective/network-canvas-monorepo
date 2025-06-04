import { PureComponent } from "react";
import { uniqueId } from "lodash";
import cx from "classnames";
import Icon from "../Icon";
import MarkdownLabel from "./MarkdownLabel";

interface TextAreaProps {
	input?: {
		name?: string;
		value?: any;
		onChange?: (value: any) => void;
		[key: string]: any;
	};
	meta?: {
		active?: boolean;
		error?: string;
		invalid?: boolean;
		touched?: boolean;
	};
	type?: string;
	label?: string | null;
	autoFocus?: boolean;
	fieldLabel?: string | null;
	className?: string;
	placeholder?: string;
	hidden?: boolean;
}

class TextArea extends PureComponent<TextAreaProps> {
	static defaultProps = {
		input: {},
		meta: {},
		type: "text",
		autoFocus: false,
		label: null,
		fieldLabel: null,
		placeholder: "",
		className: "",
		hidden: false,
	};

	id: string;
	constructor(props: TextAreaProps) {
		super(props);
		this.id = uniqueId("label");
	}

	render() {
		const {
			meta: { active, error, invalid, touched },
			label,
			placeholder,
			fieldLabel,
			className,
			type,
			autoFocus,
			hidden,
			input,
		} = this.props;

		const seamlessClasses = cx(className, "form-field-text", {
			"form-field-text--has-focus": active,
			"form-field-text--has-error": invalid && touched && error,
		});

		return (
			<label htmlFor={this.id} className="form-field-container" hidden={hidden} name={input.name}>
				{fieldLabel || label ? <MarkdownLabel label={fieldLabel || label} /> : ""}
				<div className={seamlessClasses}>
					<textarea
						id={this.id}
						className="form-field form-field-text form-field-text--area form-field-text__input"
						placeholder={placeholder} // eslint-disable-line
						type={type}
						// eslint-disable-next-line react/jsx-props-no-spreading
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
	}
}


export default TextArea;
