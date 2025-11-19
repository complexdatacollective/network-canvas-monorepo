import { isEqual } from "es-toolkit/compat";
import type React from "react";
import { Component } from "react";
import { compose, defaultProps } from "recompose";
import { getValidations } from "~/utils/validations";

const getValue = (eventOrValue: unknown) => {
	if (!eventOrValue || typeof eventOrValue !== "object" || !("target" in eventOrValue)) {
		return eventOrValue;
	}

	const target = eventOrValue.target as HTMLInputElement;
	const value = target.type === "checkbox" ? target.checked : target.value;

	return value;
};

type DetachedFieldState = {
	error: string;
	valid: boolean | null;
	invalid: boolean | null;
	touched: boolean;
};

type DetachedFieldProps = {
	onChange: (eventOrValue: unknown, nextValue: unknown, currentValue: unknown, name: string | null) => void;
	value?: unknown;
	name?: string | null;
	validation: Record<string, unknown>;
	component: React.ComponentType<{
		input: { value: unknown; name: string | null; onChange: (eventOrValue: unknown) => void };
		meta: Record<string, unknown>;
		[key: string]: unknown;
	}>;
	meta?: Record<string, unknown>;
	[key: string]: unknown; // Allow additional props to be passed through
};

/*
 * Interface mirroring that of Redux Form Field,
 * for compatablity with our input components, without the
 * pesky redux integration (relies on `onChange` and `value`).
 * Currently only the minimum required interface has been
 * implemented for our use-case.
 *
 * Redux Form Field API documentation:
 * https://redux-form.com/7.4.2/docs/api/field.md/
 */

class DetachedField extends Component<DetachedFieldProps, DetachedFieldState> {
	static defaultProps = {
		name: null,
		meta: {},
		value: null,
	};

	constructor(props: DetachedFieldProps) {
		super(props);

		this.state = {
			error: "",
			valid: null,
			invalid: null,
			touched: false,
		};
	}

	handleChange = (eventOrValue: unknown) => {
		const { onChange, name, value } = this.props;

		const nextValue = getValue(eventOrValue);
		this.setState({ touched: true });
		this.validate(nextValue);
		onChange(eventOrValue, nextValue, value, name ?? null);
	};

	validate(value: unknown) {
		const { validation } = this.props;

		const validate = getValidations(validation);

		const errors = validate.reduce((memo: string[], rule: (value: unknown) => string | undefined) => {
			const result = rule(value);
			if (!result) {
				return memo;
			}
			memo.push(result);
			return memo;
		}, []);

		const isValid = errors.length === 0;

		const meta = {
			error: errors.join(),
			valid: isValid,
			invalid: !isValid,
		};

		if (!isEqual(meta, this.state)) {
			this.setState(meta);
		}
	}

	render() {
		const { component: FieldComponent, onChange, validation, value, name, meta, ...props } = this.props;

		const input = {
			value,
			name: name ?? null,
			onChange: this.handleChange,
		};

		return (
			<FieldComponent
				{...props}
				input={input}
				meta={{
					...meta,
					...this.state,
				}}
			/>
		);
	}
}

export default compose(defaultProps({ validation: {} }))(DetachedField as React.ComponentType<unknown>);
