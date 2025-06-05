import React, { Component, RefObject } from "react";
import cx from "classnames";
import Icon from "../../Icon";
import DatePicker from "./DatePicker";
import MarkdownLabel from "../MarkdownLabel";

interface FieldInput {
	name: string;
	value?: any;
	onBlur?: (value: any) => void;
	onChange?: (value: any) => void;
	onFocus?: (event: any) => void;
}

interface FieldMeta {
	error?: string;
	invalid?: boolean;
	touched?: boolean;
}

interface DatePickerFieldProps {
	parameters?: Record<string, any>;
	input: FieldInput;
	meta?: FieldMeta;
	label?: string | null;
	placeholder?: string | null;
	fieldLabel?: string | null;
	className?: string | null;
	hidden?: boolean | null;
}

class DatePickerField extends Component<DatePickerFieldProps> {
	ref: RefObject<HTMLDivElement>;

	constructor(props: DatePickerFieldProps) {
		super(props);

		this.ref = React.createRef();
	}

	render() {
		const {
			input,
			meta = {},
			label = null,
			placeholder = null,
			parameters = {},
			fieldLabel = null,
			className = null,
			hidden = null,
		} = this.props;

		const { error, invalid = false, touched = false } = meta;

		const formFieldClasses = cx(className, "form-field-date-picker", {
			"form-field-date-picker--has-error": invalid && touched,
		});

		const anyLabel = fieldLabel || label;
		return (
			<div className="form-field-container" hidden={!!hidden} ref={this.ref}>
				{anyLabel && <MarkdownLabel label={anyLabel} />}
				<div className={formFieldClasses} data-name={input.name}>
					<DatePicker
						parameters={parameters}
						// eslint-disable-next-line react/jsx-props-no-spreading
						{...input}
						onChange={input.onBlur}
						parentRef={this.ref}
						placeholder={placeholder}
					/>
					{invalid && touched && (
						<div className="form-field-date-picker__error">
							<div className="form-field-date-picker__error-message">
								<Icon name="warning" />
								{error}
							</div>
						</div>
					)}
				</div>
			</div>
		);
	}
}

export default DatePickerField;