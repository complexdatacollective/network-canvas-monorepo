import cx from "classnames";
import React, { Component, type RefObject } from "react";
import MarkdownLabel from "~/components/Form/Fields/MarkdownLabel";
import Icon from "~/lib/legacy-ui/components/Icon";
import DatePicker from "./DatePicker";

interface FieldInput {
	name: string;
	value?: unknown;
	onBlur?: (value: unknown) => void;
	onChange?: (value: unknown) => void;
	onFocus?: (event: React.FocusEvent) => void;
}

interface FieldMeta {
	error?: string;
	invalid?: boolean;
	touched?: boolean;
}

interface DatePickerFieldProps {
	parameters?: Record<string, unknown>;
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
