import cx from "classnames";
import { PureComponent } from "react";
import type { Option } from "~/components/Form/Fields/utils/options";
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

const defaultProps: Partial<ModeProps> = {
	options: [],
	meta: {},
};

class Mode extends PureComponent<ModeProps> {
	static defaultProps = defaultProps;

	handleClickMode = (index: number) => {
		const { input, options = [] } = this.props;
		const option = options[index];
		if (option) {
			const value = getValue(option as Option);
			if (typeof value === "string" || typeof value === "number") {
				return input.onChange(value);
			}
		}
	};

	isModeSelected = (option: string | number) => {
		const { input } = this.props;
		return input.value === option;
	};

	handleKeyDown = (index: number, disabled: boolean | undefined) => (e: React.KeyboardEvent) => {
		if (!disabled && (e.key === "Enter" || e.key === " ")) {
			e.preventDefault();
			this.handleClickMode(index);
		}
	};

	renderMode = (option: OptionType, index: number) => {
		const {
			input: { value },
		} = this.props;
		const { value: optionValue, label: optionLabel, ...optionRest } = asOptionObject(option as Option);
		const selected = optionValue === value;
		const disabled = optionRest.disabled as boolean | undefined;

		const optionClasses = cx(
			"form-fields-mode__option",
			{ "form-fields-mode__option--selected": selected },
			{ "form-fields-mode__option--disabled": disabled },
		);

		return (
			<div
				className={optionClasses}
				onClick={disabled ? undefined : () => this.handleClickMode(index)}
				onKeyDown={this.handleKeyDown(index, disabled)}
				role="button"
				tabIndex={disabled ? -1 : 0}
				aria-label={typeof optionLabel === "string" ? optionLabel : undefined}
				aria-disabled={disabled}
				key={String(optionValue)}
				// eslint-disable-next-line react/jsx-props-no-spreading
				{...(optionRest as Record<string, unknown>)}
			>
				{optionLabel}
			</div>
		);
	};

	render() {
		const { options = [], className, label, meta = {} } = this.props;

		const { touched, invalid, error } = meta;

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
