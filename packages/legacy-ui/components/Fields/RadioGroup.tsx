import cx from "classnames";
import { Component } from "react";
import { v4 as uuid } from "uuid";
import Icon from "../Icon";
import MarkdownLabel from "./MarkdownLabel";
import Radio from "./Radio";
import { asOptionObject, getValue } from "./utils/options";

interface RadioGroupProps {
	options?: any[];
	label?: string | null;
	input: {
		value: any;
		name: string;
		onChange: (value: any) => void;
	};
	className?: string | null;
	fieldLabel?: string | null;
	meta?: {
		error?: string;
		invalid?: boolean;
		touched?: boolean;
	};
	optionComponent?: React.ComponentType<any>;
}

class RadioGroup extends Component<RadioGroupProps> {
	id = uuid();

	constructor(props: RadioGroupProps) {
		super(props);
	}

	onChange = (index: number) => {
		const {
			input: { onChange },
			options,
		} = this.props;

		return onChange(getValue(options[index]));
	};

	renderOption = (option: any, index: number) => {
		const {
			input: { value },
			optionComponent: OptionComponent,
		} = this.props;

		const { value: optionValue, label: optionLabel, ...optionRest } = asOptionObject(option);
		const selected = optionValue === value;

		return (
			<OptionComponent
				key={index}
				input={{
					value: index,
					checked: selected,
					onChange: () => this.onChange(index),
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
			input: { name },
			className,
			label,
			fieldLabel,
			meta: { error, invalid, touched },
		} = this.props;

		const containerClassNames = cx("form-field-container", {
			"form-field-radio-group--has-error": invalid && touched && error,
		});

		const classNames = cx("form-field", "form-field-radio-group", className);

		const anyLabel = fieldLabel || label;

		return (
			<div className={containerClassNames}>
				{anyLabel && <MarkdownLabel label={anyLabel} />}
				<div className={classNames} name={name}>
					{options.map(this.renderOption)}
				</div>
				{invalid && touched && (
					<div className="form-field-radio-group__error">
						<Icon name="warning" />
						{error}
					</div>
				)}
			</div>
		);
	}
}

RadioGroup.defaultProps = {
	label: null,
	fieldLabel: null,
	className: null,
	optionComponent: Radio,
	options: [],
	meta: {},
};

export { RadioGroup };

export default RadioGroup;
