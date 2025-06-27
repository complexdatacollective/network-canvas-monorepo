import cx from "classnames";
import { PureComponent } from "react";
import { v4 as uuid } from "uuid";
import MarkdownLabel from "./MarkdownLabel";

interface RadioProps {
	label?: React.ReactNode;
	fieldLabel?: string;
	className?: string;
	disabled?: boolean;
	input: {
		name?: string;
		value?: any;
		onChange?: (value: any) => void;
		[key: string]: any;
	};
	[key: string]: any;
}

class Radio extends PureComponent<RadioProps> {
	static defaultProps = {
		className: "",
		label: null,
		fieldLabel: null,
		disabled: false,
	};

	id: string;
	constructor(props: RadioProps) {
		super(props);

		this.id = uuid();
	}

	render() {
		const { label, className, input, disabled, fieldLabel, ...rest } = this.props;

		const componentClasses = cx("form-field-radio", className, {
			"form-field-radio--disabled": disabled,
		});

		return (
			<label className={componentClasses} htmlFor={this.id}>
				<input
					type="radio"
					className="form-field-radio__input"
					id={this.id}
					// input.checked is only provided by redux form if type="checkbox" or type="radio" is
					// provided to <Field />, so for the case that it isn't we can rely on the more reliable
					// input.value
					checked={!!input.value}
					// eslint-disable-next-line react/jsx-props-no-spreading
					{...input}
					// eslint-disable-next-line react/jsx-props-no-spreading
					{...rest}
				/>
				<div className="form-field-radio__radio" />
				{label && <MarkdownLabel inline label={label} className="form-field-inline-label" />}
			</label>
		);
	}
}

export default Radio;
