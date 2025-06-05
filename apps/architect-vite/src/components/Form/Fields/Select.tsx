import Icon from "@codaco/legacy-ui/components/Icon";
import cx from "classnames";
import React, { PureComponent } from "react";
import ReactSelect from "react-select";
import DefaultSelectOption from "./DefaultSelectOption";

const getValue = (options, value) => {
	const foundValue = options.find((option) => option.value === value);
	if (!foundValue) {
		return null;
	}

	return foundValue;
};

type SelectOption = {
	value: any;
	label?: string;
	__createNewOption__?: boolean;
};

type SelectProps = {
	className?: string;
	options?: SelectOption[];
	selectOptionComponent?: React.ComponentType<any>;
	onDeleteOption?: (() => void) | null;
	createNewOption?: boolean;
	onCreateNew?: (() => void) | null;
	input?: Record<string, any>;
	label?: string | null;
	children?: React.ReactNode;
	meta?: {
		invalid?: boolean;
		error?: string | null;
		touched?: boolean;
	};
};

class Select extends PureComponent<SelectProps> {
	get value() {
		const { options, input } = this.props;
		return getValue(options, input.value);
	}

	handleChange = (option) => {
		const { onCreateNew, input } = this.props;

		/* eslint-disable no-underscore-dangle */
		if (option.__createNewOption__) {
			onCreateNew();
			return;
		}
		/* eslint-enable */
		input.onChange(option.value);
	};

	handleBlur = () => {
		const { input } = this.props;
		if (!input.onBlur) {
			return;
		}
		input.onBlur(input.value);
	};

	render() {
		const {
			className,
			input: { onBlur, ...input },
			options,
			children,
			selectOptionComponent,
			label,
			createNewOption,
			meta: { invalid, error, touched },
			...rest
		} = this.props;

		const optionsWithNew = createNewOption ? [...options, { __createNewOption__: createNewOption }] : options;

		const componentClasses = cx(className, "form-fields-select", {
			"form-fields-select--has-error": invalid && touched && error,
		});
		return (
			<div className={componentClasses}>
				{label && <h4>{label}</h4>}
				<ReactSelect
					className="form-fields-select"
					classNamePrefix="form-fields-select"
					// eslint-disable-next-line react/jsx-props-no-spreading
					{...input}
					options={optionsWithNew}
					value={this.value}
					components={{ Option: selectOptionComponent }}
					styles={{ menuPortal: (base) => ({ ...base, zIndex: 9999 }) }}
					menuPortalTarget={document.body}
					onChange={this.handleChange}
					// ReactSelect has unusual onBlur that doesn't play nicely with redux-forms
					// https://github.com/erikras/redux-form/issues/82#issuecomment-386108205
					// Sending the old value on blur, and disabling blurInputOnSelect work in
					// a round about way, and still allow us to use the `touched` property.
					onBlur={this.handleBlur}
					blurInputOnSelect={false}
					// eslint-disable-next-line react/jsx-props-no-spreading
					{...rest}
				>
					{children}
				</ReactSelect>
				{invalid && touched && (
					<div className="form-fields-select__error">
						<Icon name="warning" />
						{error}
					</div>
				)}
			</div>
		);
	}
}


// Default props handled via TypeScript optional properties and destructuring defaults

export default Select;
