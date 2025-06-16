import cx from "classnames";
import { range } from "lodash";
import Icon from "~/lib/legacy-ui/components/Icon";

type ColorOption = {
	label: string;
	value: string;
};

type InputProps = {
	value: string;
	onChange: (value: string) => void;
};

type MetaProps = {
	error?: string;
	invalid?: boolean;
	touched?: boolean;
};

type ColorPickerProps = {
	palette?: string;
	paletteRange?: number;
	options?: ColorOption[];
	input: InputProps;
	label?: string;
	meta: MetaProps;
};

const asColorOption = (name: string): ColorOption => ({
	label: name,
	value: name,
});

const ColorPicker = ({ 
	palette, 
	paletteRange = 0, 
	options = [], 
	input, 
	label, 
	meta: { error, invalid, touched } 
}: ColorPickerProps) => {
	const colors = palette ? range(1, paletteRange).map((index) => asColorOption(`${palette}-${index}`)) : options;

	const handleClick = (value: string) => {
		input.onChange(value);
	};

	const renderColor = (color: ColorOption) => {
		const colorClasses = cx("form-fields-color-picker__color", {
			"form-fields-color-picker__color--selected": input.value === color.value,
		});

		return (
			<div
				className={colorClasses}
				onClick={() => handleClick(color.value)}
				style={{ "--color": `var(--${color.value})` }}
				key={color.value}
			>
				<div className="form-fields-color-picker__color-label">{color.label}</div>
			</div>
		);
	};

	const showError = invalid && touched && error;

	const pickerStyles = cx("form-fields-color-picker", { "form-fields-color-picker--has-error": showError });

	return (
		<div className="form-field-container">
			<div className={pickerStyles}>
				{label && <div className="form-fields-color-picker__label">{label}</div>}
				<div className="form-fields-color-picker__edit">
					<div className="form-fields-color-picker__colors">{colors.map(renderColor)}</div>
				</div>
				{showError && (
					<div className="form-fields-color-picker__error">
						<Icon name="warning" />
						{error}
					</div>
				)}
			</div>
		</div>
	);
};


export default ColorPicker;
