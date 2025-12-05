import cx from "classnames";
import type React from "react";
import { PureComponent } from "react";
import ReactSelect from "react-select";
import Icon from "~/lib/legacy-ui/components/Icon";

const getValue = (options: SelectOption[], value: unknown) => {
	const foundValue = options.find((option) => option.value === value);
	if (!foundValue) {
		return null;
	}

	return foundValue;
};

type SelectOption = {
	value: unknown;
	label?: string;
	__createNewOption__?: boolean;
};

type SelectProps = {
	className?: string;
	options?: SelectOption[];
	selectOptionComponent?: React.ComponentType<{
		data: SelectOption;
		[key: string]: unknown;
	}>;
	onDeleteOption?: (() => void) | null;
	createNewOption?: boolean;
	onCreateNew?: (() => void) | null;
	input?: {
		value: unknown;
		onChange: (value: unknown) => void;
		onBlur?: (value: unknown) => void;
		[key: string]: unknown;
	};
	label?: string | null;
	children?: React.ReactNode;
	meta?: {
		invalid?: boolean;
		error?: string | null;
		touched?: boolean;
	};
};

const defaultSelectProps: Partial<SelectProps> = {
	options: [],
	input: { value: null, onChange: () => {} },
	meta: {},
	onDeleteOption: null,
	createNewOption: false,
	onCreateNew: null,
};

class Select extends PureComponent<SelectProps> {
	static defaultProps = defaultSelectProps;

	get value() {
		const { options = [], input } = this.props;
		if (!input) return null;
		return getValue(options, input.value);
	}

	handleChange = (option: SelectOption | null) => {
		const { onCreateNew, input } = this.props;

		if (!option || !input) return;

		/* eslint-disable no-underscore-dangle */
		if (option.__createNewOption__) {
			onCreateNew?.();
			return;
		}
		/* eslint-enable */
		input.onChange(option.value);
	};

	handleBlur = () => {
		const { input } = this.props;
		if (!input?.onBlur) {
			return;
		}
		input.onBlur(input.value);
	};

	render() {
		const {
			className,
			input,
			options = [],
			children,
			selectOptionComponent,
			label,
			createNewOption,
			meta = {},
			...rest
		} = this.props;

		if (!input) return null;

		const { onBlur, ...inputRest } = input;
		const { invalid, error, touched } = meta;

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
					{...(inputRest as Record<string, unknown>)}
					options={optionsWithNew}
					value={this.value}
					components={selectOptionComponent ? { Option: selectOptionComponent } : undefined}
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
					{...(rest as Record<string, unknown>)}
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
