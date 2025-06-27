import type React from "react";
import { Component } from "react";
import { isEqual } from "es-toolkit/compat";
import { compose, defaultProps } from "recompose";
import { getValidations } from "~/utils/validations";

const getValue = (eventOrValue: any) => {
	if (!eventOrValue || !eventOrValue.target) {
		return eventOrValue;
	}

	const { target } = eventOrValue;
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
	onChange: (eventOrValue: any, nextValue: any, currentValue: any, name: any) => void;
	value?: any;
	name?: any;
	validation: Record<string, unknown>;
	component: React.ComponentType<any>;
	meta?: Record<string, unknown>;
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

	handleChange = (eventOrValue: any) => {
		const { onChange, name, value } = this.props;

		const nextValue = getValue(eventOrValue);
		this.setState({ touched: true });
		this.validate(nextValue);
		onChange(eventOrValue, nextValue, value, name);
	};

	validate(value: any) {
		const { validation } = this.props;

		const validate = getValidations(validation);

		const errors = validate.reduce((memo: string[], rule: (value: any) => string | undefined) => {
			const result = rule(value);
			if (!result) {
				return memo;
			}
			return [...memo, result];
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
			name,
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

export default compose(defaultProps({ validation: {} }))(DetachedField);
