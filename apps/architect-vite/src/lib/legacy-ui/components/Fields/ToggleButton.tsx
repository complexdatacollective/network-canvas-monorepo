import cx from "classnames";
import { PureComponent } from "react";
import { v4 as uuid } from "uuid";
import MarkdownLabel from "./MarkdownLabel";

interface ToggleButtonProps {
	label?: string | null;
	className?: string;
	disabled?: boolean;
	input: {
		value: any;
		[key: string]: any;
	};
	color?: string;
	fieldLabel?: string | null;
	[key: string]: any;
}

class ToggleButton extends PureComponent<ToggleButtonProps> {
	id = uuid();

	constructor(props: ToggleButtonProps) {
		super(props);
	}

	render() {
		const { label, className = "", input, disabled = false, color = "cat-color-seq-1", fieldLabel, ...rest } = this.props;

		const componentClasses = cx("form-field-togglebutton", `form-field-togglebutton-${color}`, className, {
			"form-field-togglebutton--disabled": disabled,
		});

		return (
			<label className={componentClasses} htmlFor={this.id}>
				<div>
					<input
						className="form-field-togglebutton__input"
						id={this.id}
						checked={!!input.value}
						// eslint-disable-next-line react/jsx-props-no-spreading
						{...input}
						// eslint-disable-next-line react/jsx-props-no-spreading
						{...rest}
						type="checkbox"
					/>
					<div className="form-field-togglebutton__checkbox">
						<MarkdownLabel inline label={label} />
					</div>
				</div>
			</label>
		);
	}
}

export default ToggleButton;
