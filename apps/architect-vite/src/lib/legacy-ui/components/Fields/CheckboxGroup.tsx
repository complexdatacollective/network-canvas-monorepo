import { PureComponent } from "react";
import cx from "classnames";
import Checkbox from "./Checkbox";
import { asOptionObject, getValue } from "./utils/options";
import Icon from "../Icon";
import MarkdownLabel from "./MarkdownLabel";

interface CheckboxGroupProps {
	options?: any[];
	className?: string | null;
	label?: string | null;
	fieldLabel?: string | null;
	input: {
		name: string;
		value?: any[];
		onChange: (value: any[]) => void;
	};
	optionComponent?: React.ComponentType<any>;
	meta?: {
		error?: string;
		invalid?: boolean;
		touched?: boolean;
	};
}

class CheckboxGroup extends PureComponent<CheckboxGroupProps> {
	static defaultProps = {
		className: null,
		label: null,
		fieldLabel: null,
		options: [],
		optionComponent: Checkbox,
		meta: {},
	};
	get value() {
		const {
			input: { value },
		} = this.props;
		return value;
	}

	handleClickOption = (index: number) => {
		const {
			input: { onChange },
			options,
		} = this.props;
		const option = getValue(options[index]);
		const newValue = this.isOptionChecked(option)
			? this.value.filter((value) => value !== option)
			: [...this.value, option];

		onChange(newValue);
	};

	isOptionChecked = (option: any) => {
		const {
			input: { value = [] },
		} = this.props;
		const included = value.includes(option);
		return included;
	};

	renderOption = (option: any, index: number) => {
		const { optionComponent } = this.props;
		const OptionComponent = optionComponent;
		const { value: optionValue, label: optionLabel, ...optionRest } = asOptionObject(option);

		return (
			<OptionComponent
				className="form-field-checkbox-group__option"
				key={index}
				input={{
					value: index,
					checked: this.isOptionChecked(optionValue),
					onChange: () => this.handleClickOption(index),
				}}
				label={optionLabel}
				// eslint-disable-next-line react/jsx-props-no-spreading
				{...optionRest}
			/>
		);
	};

	render() {
		const {
			options,
			className,
			fieldLabel,
			label,
			input: { name },
			meta: { error, invalid, touched },
		} = this.props;

		const classNames = cx(
			"form-field-checkbox-group",
			"form-field-container",
			{
				"form-field-checkbox-group--has-error": invalid && touched && error,
			},
			className,
		);

		const anyLabel = fieldLabel || label;

		return (
			<div className={classNames}>
				{anyLabel && <MarkdownLabel label={anyLabel} />}
				<div className="form-field" name={name}>
					{options.map(this.renderOption)}
				</div>
				{invalid && touched && (
					<div className="form-field-checkbox-group__error">
						<Icon name="warning" />
						{error}
					</div>
				)}
			</div>
		);
	}
}


export default CheckboxGroup;
