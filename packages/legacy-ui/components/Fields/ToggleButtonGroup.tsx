import { PureComponent } from "react";
import cx from "classnames";
import ToggleButton from "./ToggleButton";
import Icon from "../Icon";
import { asOptionObject, getValue } from "./utils/options";
import MarkdownLabel from "./MarkdownLabel";

interface ToggleButtonGroupProps {
	options?: any[];
	className?: string | null;
	label?: string | null;
	fieldLabel?: string | null;
	input: {
		value?: any[];
		name: string;
		onChange: (value: any[]) => void;
	};
	meta?: {
		error?: string;
		invalid?: boolean;
		touched?: boolean;
	};
}

class ToggleButtonGroup extends PureComponent<ToggleButtonGroupProps> {
	get value() {
		const {
			input: { value },
		} = this.props;
		return value;
	}

	handleClickOption = (event: React.ChangeEvent<HTMLInputElement>) => {
		const { options, input } = this.props;

		const option = getValue(options[parseInt(event.target.value, 10)]);
		const newValue = this.isOptionChecked(option)
			? this.value.filter((value) => value !== option)
			: [...this.value, option];

		input.onChange(newValue);
	};

	isOptionChecked = (option: any) => {
		const {
			input: { value = [] },
		} = this.props;
		const included = value.includes(option);
		return included;
	};

	renderOption = (option: any, index: number) => {
		const { value: optionValue, label: optionLabel } = asOptionObject(option);

		return (
			<ToggleButton
				className="form-field-togglebutton-group__option"
				key={index}
				input={{
					value: index,
					checked: this.isOptionChecked(optionValue),
					onChange: this.handleClickOption,
				}}
				label={optionLabel}
				color={`cat-color-seq-${index}`}
			/>
		);
	};

	render() {
		const {
			options = [],
			className = null,
			label = null,
			fieldLabel = null,
			input: { name },
			meta: { error, invalid, touched } = {},
		} = this.props;

		const classNames = cx("form-field-togglebutton-group", "form-field-container", className, {
			"form-field-togglebutton-group--has-error": invalid && touched && error,
		});

		const anyLabel = fieldLabel || label;

		return (
			<div className={classNames}>
				{anyLabel && <MarkdownLabel label={anyLabel} />}
				<div className="form-field form-field__inline" name={name}>
					{options.map(this.renderOption)}
				</div>
				{invalid && touched && (
					<div className="form-field-togglebutton-group__error">
						<Icon name="warning" />
						{error}
					</div>
				)}
			</div>
		);
	}
}

export default ToggleButtonGroup;
