import cx from "classnames";
import { PureComponent } from "react";
import { asOptionObject, getValue } from "~/components/Form/Fields/utils/options";

type OptionType = {
	value: string | number;
	label: string;
	disabled?: boolean;
};

type InputProps = {
	value: string | number;
	onChange: (value: string | number) => void;
};

type MetaProps = {
	touched?: boolean;
	invalid?: boolean;
	error?: string;
};

type ModeProps = {
	options?: OptionType[];
	label?: string | null;
	meta?: MetaProps;
	className?: string | null;
	input: InputProps;
};

class Mode extends PureComponent<ModeProps> {
	handleClickMode = (index: number) => {
		const { input, options } = this.props;
		return input.onChange(getValue(options[index]));
	};

	isModeSelected = (option: string | number) => {
		const { input } = this.props;
		return input.value === option;
	};

	renderMode = (option: OptionType, index: number) => {
		const {
			input: { value },
		} = this.props;
		const { value: optionValue, label: optionLabel, ...optionRest } = asOptionObject(option);
		const selected = optionValue === value;
		const disabled = optionRest.disabled || false;

		const optionClasses = cx(
			"form-fields-mode__option",
			{ "form-fields-mode__option--selected": selected },
			{ "form-fields-mode__option--disabled": disabled },
		);

		return (
			<div
				className={optionClasses}
				onClick={disabled ? null : () => this.handleClickMode(index)}
				key={optionValue}
				// eslint-disable-next-line react/jsx-props-no-spreading
				{...optionRest}
			>
				{optionLabel}
			</div>
		);
	};

	render() {
		const {
			options,
			className,
			label,
			meta: { touched, invalid, error },
		} = this.props;

		const classNames = cx("form-field-container", "form-fields-mode", className, {
			"form-fields-mode--has-error": touched && invalid,
		});

		return (
			<div className={classNames}>
				{label && <h4 className="form-fields-mode__label">{label}</h4>}
				<div className="form-fields-mode__options">{options.map(this.renderMode)}</div>
				{touched && invalid && <p className="form-fields-mode__error">{error}</p>}
			</div>
		);
	}
}

// Default props handled via TypeScript optional properties and default parameter values

export default Mode;
