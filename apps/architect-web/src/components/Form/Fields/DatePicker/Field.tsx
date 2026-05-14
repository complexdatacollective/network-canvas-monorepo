import React, { Component, type RefObject } from "react";
import MarkdownLabel from "~/components/Form/Fields/MarkdownLabel";
import Icon from "~/lib/legacy-ui/components/Icon";
import { cx } from "~/utils/cva";
import DatePicker from "./DatePicker";

type FieldInput = {
	name: string;
	value?: unknown;
	onBlur?: (value: unknown) => void;
	onChange?: (value: unknown) => void;
	onFocus?: (event: React.FocusEvent) => void;
};

type FieldMeta = {
	error?: string;
	invalid?: boolean;
	touched?: boolean;
};

type DatePickerFieldProps = {
	parameters?: Record<string, unknown>;
	input: FieldInput;
	meta?: FieldMeta;
	label?: string | null;
	placeholder?: string | null;
	fieldLabel?: string | null;
	className?: string | null;
	hidden?: boolean | null;
};

class DatePickerField extends Component<DatePickerFieldProps> {
	ref: RefObject<HTMLDivElement | null>;

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

		const hasError = !!(invalid && touched);

		const anyLabel = fieldLabel || label;
		return (
			<div className="form-field-container" hidden={!!hidden} ref={this.ref}>
				{anyLabel && <MarkdownLabel label={anyLabel} />}
				<div
					className={cx("text-input-foreground", hasError && "rounded-t-sm border-2 border-error", className)}
					data-name={input.name}
				>
					<DatePicker
						parameters={parameters}
						value={typeof input.value === "string" ? input.value : null}
						onChange={input.onBlur}
						parentRef={this.ref}
						placeholder={placeholder}
					/>
					{hasError && (
						<div className="flex items-center bg-error px-(--space-xs) py-(--space-sm) rounded-b-sm text-error-foreground [&_svg]:max-h-(--space-md)">
							<Icon name="warning" />
							{error}
						</div>
					)}
				</div>
			</div>
		);
	}
}

export default DatePickerField;
