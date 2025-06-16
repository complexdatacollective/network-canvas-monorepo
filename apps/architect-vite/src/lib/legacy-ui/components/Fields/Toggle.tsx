import cx from "classnames";
import { isBoolean } from "lodash";
import { PureComponent } from "react";
import { v4 as uuid } from "uuid";
import Icon from "../Icon";
import MarkdownLabel from "./MarkdownLabel";

interface ToggleProps {
	label?: string | null;
	title?: string;
	fieldLabel?: string | null;
	className?: string;
	disabled?: boolean;
	input: {
		name?: string;
		value?: any;
		onChange: (value: boolean) => void;
		[key: string]: any;
	};
	meta?: {
		error?: string;
		invalid?: boolean;
		touched?: boolean;
	};
	[key: string]: any;
}

class Toggle extends PureComponent<ToggleProps> {
	static defaultProps = {
		className: "",
		label: null,
		title: "",
		fieldLabel: null,
		disabled: false,
		meta: {},
	};

	id: string;
	constructor(props: ToggleProps) {
		super(props);

		this.id = uuid();

		const {
			input: { value, onChange },
		} = this.props;

		// Because redux forms will just not pass on this
		// field if it was never touched and we need it to
		// return `false`.
		if (!isBoolean(value)) {
			onChange(false);
		}
	}

	render() {
		const {
			label,
			fieldLabel,
			className,
			input,
			disabled,
			title,
			meta: { error, invalid, touched },
			...rest
		} = this.props;

		const containerClassNames = cx("form-field-container", {
			"form-field-toggle--has-error": invalid && touched && error,
		});

		const componentClasses = cx("form-field", "form-field-toggle", className, {
			"form-field-toggle--disabled": disabled,
			"form-field-toggle--has-error": invalid && touched && error,
		});

		return (
			<div className={containerClassNames} name={input.name}>
				{fieldLabel && <MarkdownLabel label={fieldLabel} />}
				<label className={componentClasses} htmlFor={this.id} title={title}>
					<input
						className="form-field-toggle__input"
						id={this.id}
						// eslint-disable-next-line react/jsx-props-no-spreading
						{...input}
						// eslint-disable-next-line react/jsx-props-no-spreading
						{...rest}
						checked={!!input.value}
						disabled={disabled}
						type="checkbox"
						value="true"
					/>
					<div className="form-field-toggle__toggle">
						<span className="form-field-toggle__button" />
					</div>
					{label && <MarkdownLabel inline label={label} className="form-field-inline-label" />}
				</label>
				{invalid && touched && (
					<div className="form-field-toggle__error">
						<Icon name="warning" />
						{error}
					</div>
				)}
			</div>
		);
	}
}


export default Toggle;
