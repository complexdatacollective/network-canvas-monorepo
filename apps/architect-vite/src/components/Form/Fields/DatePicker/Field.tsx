import React, { Component, type ReactNode, type RefObject } from "react";
import { v4 as uuid } from "uuid";
import { BaseField } from "~/components/Form/BaseField";
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
	required?: boolean;
	hint?: ReactNode;
};

class DatePickerField extends Component<DatePickerFieldProps> {
	ref: RefObject<HTMLDivElement | null>;
	id: string;

	constructor(props: DatePickerFieldProps) {
		super(props);

		this.ref = React.createRef();
		this.id = uuid();
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
			required = false,
			hint,
		} = this.props;

		const { error, invalid = false, touched = false } = meta;
		const showErrors = Boolean(touched && invalid && error);
		const errors = error ? [error] : [];

		const describedBy =
			[hint ? `${this.id}-hint` : null, showErrors ? `${this.id}-error` : null].filter(Boolean).join(" ") || undefined;

		const anyLabel = fieldLabel ?? label ?? undefined;

		return (
			<BaseField
				id={this.id}
				name={input.name}
				label={anyLabel}
				hint={hint}
				required={required}
				errors={errors}
				showErrors={showErrors}
				containerProps={hidden ? { hidden: true } : undefined}
			>
				<div ref={this.ref} data-name={input.name} className={className ?? undefined}>
					<DatePicker
						id={this.id}
						parameters={parameters}
						value={typeof input.value === "string" ? input.value : null}
						onChange={input.onBlur}
						parentRef={this.ref}
						placeholder={placeholder}
						aria-invalid={showErrors || undefined}
						aria-required={required || undefined}
						aria-describedby={describedBy}
					/>
				</div>
			</BaseField>
		);
	}
}

export default DatePickerField;
